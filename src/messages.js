/* messages.js — what you say on the band, what it is read as, and who comes.
 *
 * DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3, step 3 (sections 4 and 5).
 *
 * THE CONSOLE IS A MENU, and the menu is screens.js's comms page — it
 * always was. What this file adds is the one free-text field in it: a
 * message you write yourself, for a distress call or to a ship you have
 * hailed. The text CARRIES WEIGHT — the kind of lie matters — so it is
 * read into claims, and the claims are what the world acts on.
 *
 * READ AS, THEN SEND. Before anything goes out the player is shown what
 * the game understood ("cargo — refugees · situation — drive failure"),
 * and any claim that does not match the ship is spelled out as the lie it
 * is. Misread? Edit and resend. Lying? You have to look at the lie and
 * confirm it. Every lie in this game is a conscious one.
 *
 * THE READER. The design names a small sentence-embedding model (MiniLM
 * via transformers.js) so that synonyms and paraphrase cannot sidestep
 * consequences. What is here instead is an anchor-phrase matcher: the same
 * slots and the same anchor lists the embedding version would be authored
 * against, matched lexically with crude stemming and negation, so it runs
 * with no dependency and no model download, deterministically. It is
 * behind ONE function, `read(text)`, so the embedding model can replace it
 * without anything else changing — and the Read-as confirmation is what
 * makes a lexical miss harmless rather than unfair: the player sees the
 * miss before it costs them anything.
 *
 * TRUTH IS CHECKED, NOT ASSUMED. A claim is compared against the real
 * ship — the hold, the berths, the hull, the tanks, who is shooting — at
 * the moment of sending AND again when a responder arrives, because a ship
 * that was really drifting when it called and has since been refuelled is
 * not lying, and one that "had pirates on it" when nobody was there is.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;
  var V = global.V;

  /* ---- the reader ---------------------------------------------------------
   * Slots and the anchor phrases that fill them. Each anchor is a phrase;
   * its tokens must appear in order within a short window, after stemming.
   * Weight is the number of tokens, so "life support" beats "support". */
  var ANCHORS = {
    cargo: {
      humanitarian: ['refugee', 'refugees', 'people fleeing', 'fleeing', 'evacuees', 'evacuating',
                     'escaped slaves', 'freed slaves', 'rescued slaves', 'former slaves',
                     'children', 'families', 'survivors', 'civilians', 'colonists',
                     'passengers', 'medical supplies', 'medicine', 'medicines', 'vaccines',
                     'relief supplies', 'aid', 'food aid', 'humanitarian'],
      contraband:   ['narcotics', 'drugs', 'stims', 'weapons', 'guns', 'arms', 'munitions',
                     'restricted arms', 'contraband', 'gold buds', 'goldbuds', 'slaves',
                     'smuggled', 'illegal cargo'],
      valuable:     ['gold', 'platinum', 'precious', 'gems', 'jewels', 'luxury', 'luxuries',
                     'luxury goods', 'rare metals', 'artefacts', 'artifacts', 'valuable',
                     'fortune', 'treasure', 'ai cores', 'gene therapies', 'fusion cells',
                     'military fuel'],
      ordinary:     ['cargo', 'freight', 'hold full', 'grain', 'ore', 'ores', 'water', 'timber',
                     'livestock', 'fish', 'textiles', 'chemicals', 'alloys', 'machinery',
                     'computers', 'robotics', 'wine', 'fruit', 'hydrogen', 'waste'],
      none:         ['empty hold', 'hold empty', 'hold is empty', 'nothing aboard', 'running empty',
                     'no cargo', 'empty']
    },
    situation: {
      drive:        ['drive failure', 'drive failed', 'drive dead', 'drive is dead', 'drive down',
                     'engine failure', 'engines down', 'engines dead', 'engine dead', 'no power',
                     'drifting', 'adrift', 'dead in space', 'stranded', 'out of fuel', 'no fuel',
                     'out of reaction mass', 'cannot manoeuvre', 'cannot maneuver'],
      explosion:    ['about to explode', 'going to explode', 'explode', 'explosion', 'about to blow',
                     'going to blow', 'reactor critical', 'reactor going critical', 'meltdown',
                     'core breach', 'overload', 'detonate'],
      lifesupport:  ['life support', 'oxygen', 'air is', 'running out of air', 'suffocating',
                     'cannot breathe', 'scrubbers'],
      breach:       ['hull breach', 'breached', 'venting', 'decompression', 'decompressing',
                     'holed', 'leaking atmosphere'],
      attack:       ['under attack', 'being attacked', 'attacked', 'taking fire', 'being shot',
                     'fired upon', 'shooting at us', 'firing on us', 'opened fire', 'ambushed'],
      casualties:   ['wounded', 'injured', 'casualties', 'dying', 'hurt', 'medical emergency',
                     'bleeding', 'crew down', 'need a doctor']
    },
    threat: {
      pirates:      ['pirate', 'pirates', 'raider', 'raiders', 'bandits', 'syndicate', 'outlaws',
                     'marauders', 'corsairs'],
      patrol:       ['police', 'patrol', 'navy', 'cutter', 'authorities', 'the law', 'customs',
                     'warship'],
      unknown:      ['unknown ship', 'unknown vessel', 'unidentified', 'unknown contact']
    }
  };

  /* Human words for each value, for Read-as and for composing calls. */
  var WORDS = {
    cargo: { humanitarian: 'people or relief in the hold', contraband: 'contraband',
             valuable: 'valuable cargo', ordinary: 'ordinary freight', none: 'an empty hold' },
    situation: { drive: 'drive failure', explosion: 'about to explode', lifesupport: 'life support failing',
                 breach: 'hull breach', attack: 'under attack', casualties: 'wounded aboard' },
    threat: { pirates: 'pirates', patrol: 'a patrol', unknown: 'an unknown ship' }
  };

  var GENERIC = { cargo: 1, freight: 1, 'hold full': 1, empty: 1, aid: 1 };

  var NEGATORS = { not: 1, no: 1, never: 1, without: 1, none: 1, nothing: 1, nobody: 1, zero: 1 };
  var BREAKS = { and: 0, but: 1 };   // "but" ends a negation's reach

  function stem(w) {
    if (w.length > 4) {
      if (/ing$/.test(w)) w = w.slice(0, -3);
      else if (/ied$/.test(w)) w = w.slice(0, -3) + 'y';
      else if (/ies$/.test(w)) w = w.slice(0, -3) + 'y';
      else if (/ed$/.test(w)) w = w.slice(0, -2);
      else if (/es$/.test(w)) w = w.slice(0, -2);
      else if (/s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    }
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
    return w;
  }

  function tokens(text) {
    var t = String(text || '').toLowerCase()
      .replace(/n['’]t\b/g, ' not')
      .replace(/\bcannot\b/g, 'can not')
      .replace(/[^a-z0-9\s.!?;,]/g, ' ');
    var out = [], parts = t.split(/(\s+|[.!?;,])/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || /^\s+$/.test(p)) continue;
      if (/^[.!?;,]$/.test(p)) { out.push({ w: '.', s: '.', brk: true }); continue; }
      out.push({ w: p, s: stem(p) });
    }
    return out;
  }

  var _anchorCache = null;
  function anchors() {
    if (_anchorCache) return _anchorCache;
    var list = [];
    for (var slot in ANCHORS) {
      for (var val in ANCHORS[slot]) {
        ANCHORS[slot][val].forEach(function (phrase) {
          list.push({ slot: slot, value: val, phrase: phrase,
                      toks: phrase.split(' ').map(stem) });
        });
      }
    }
    _anchorCache = list;
    return list;
  }

  /* Find an anchor's tokens in order within a window of its own length
   * plus two (so "drive has completely failed" still reads as drive
   * failure, and "drive ... three sentences later ... failed" does not). */
  function findAnchor(toks, a) {
    var n = a.toks.length, hits = [];
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].s !== a.toks[0]) continue;
      var j = i, k = 1, last = i;
      while (k < n && j < toks.length - 1 && j - i < n + 2) {
        j++;
        if (toks[j].brk) break;
        if (toks[j].s === a.toks[k]) { k++; last = j; }
      }
      if (k === n) hits.push({ start: i, end: last });
    }
    return hits;
  }

  function negatedAt(toks, start) {
    for (var b = start - 1; b >= 0 && b >= start - 3; b--) {
      if (toks[b].brk || BREAKS[toks[b].w]) return false;
      if (NEGATORS[toks[b].w]) return true;
    }
    return false;
  }

  /* text -> { cargo, situation, threat }, each null or
   * { value, label, neg, score }. The label is the anchor that matched, so
   * Read-as says "refugees" and not just "humanitarian". */
  function read(text) {
    var toks = tokens(text);
    var best = { cargo: null, situation: null, threat: null };
    var covered = {};
    var list = anchors().slice().sort(function (x, y) { return y.toks.length - x.toks.length; });
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var hits = findAnchor(toks, a);
      for (var h = 0; h < hits.length; h++) {
        /* Longest phrases claim their tokens first, so "medical supplies"
         * is not also "supplies", and "restricted arms" is not "arms". */
        var key = a.slot + '|' + hits[h].start;
        var clash = false;
        for (var q = hits[h].start; q <= hits[h].end; q++) if (covered[a.slot + '@' + q]) clash = true;
        if (clash) continue;
        for (var q2 = hits[h].start; q2 <= hits[h].end; q2++) covered[a.slot + '@' + q2] = true;
        var neg = negatedAt(toks, hits[h].start);
        /* GENERIC WORDS LOSE TO NAMED GOODS. "Hold full of narcotics" is a
         * narcotics claim; "hold full" only says there is something in it.
         * Without this the longer generic phrase won on length and a
         * named lie read as a vague truth. */
        var score = (GENERIC[a.phrase] ? 0.4 : a.toks.length) + (neg ? 0 : 0.5);
        var cur = best[a.slot];
        /* A plain claim beats a denial in the same slot: "not drugs, but
         * refugees" is a refugee claim. Otherwise the stronger match. */
        if (!cur || (cur.neg && !neg) || (cur.neg === neg && score > cur.score)) {
          best[a.slot] = { value: a.value, label: a.phrase, neg: neg, score: score, key: key };
        }
      }
    }
    return best;
  }

  /* ---- the embedding reader ------------------------------------------------
   * Astra, 2026-10-18: "swap it in, we want the maximal ability to process
   * language in English." A small sentence-embedding model (transformers.js,
   * run locally — see embedder.js) turns each CLAUSE of the message into a
   * vector, and each claim value has a handful of prototype sentences
   * turned into vectors once at load. A clause reads as the value whose
   * prototypes it is nearest to, if it is near enough (TAU) and clearly
   * nearer than the next value (MARGIN). That is what lets "our engines are
   * toast" mean drive failure without anyone having written "toast" down.
   *
   * NEGATION STAYS LEXICAL. Embedding models are famously bad at it — "not
   * carrying slaves" sits right beside "carrying slaves" — so whether a
   * clause asserts or denies is still the negator test from the matcher.
   *
   * AND THE MATCHER STILL VOTES. Where the anchor lists DO match, the
   * lexical read is precise, so it is kept for that slot; the model fills
   * the slots the lists missed. Which combination wins was MEASURED
   * against test/reader-phrases.json (doctrine 6), not assumed —
   * see tools/bench-reader.mjs and the numbers in the changelog.
   *
   * The prototypes were written to describe each situation generally, and
   * deliberately NOT copied from the fixture, so the benchmark measures
   * reading rather than recall. */
  var PROTOTYPES = {
    cargo: {
      humanitarian: ['we have refugees aboard', 'there are people in our hold fleeing danger',
                     'we are carrying civilians who need safety', 'children and families are on board',
                     'we are transporting medicine and relief supplies', 'escaped slaves are hiding in our ship',
                     'we are evacuating people from a disaster'],
      contraband:   ['we are smuggling illegal drugs', 'the hold is full of contraband',
                     'we carry illegal weapons', 'there are narcotics on board',
                     'we are running guns past the authorities'],
      valuable:     ['our cargo is extremely valuable', 'we are hauling precious metals',
                     'the hold is full of luxury goods worth a fortune', 'we carry rare and expensive goods',
                     'there is a lot of money in our hold'],
      ordinary:     ['we are hauling ordinary freight', 'carrying bulk goods to market',
                     'a load of raw materials for the refinery', 'our cargo is food and supplies for sale',
                     'just routine trade goods'],
      none:         ['our hold is empty', 'we are not carrying any cargo', 'there is nothing aboard',
                     'we are flying empty']
    },
    situation: {
      drive:        ['our engine has failed', 'we have lost propulsion and are drifting',
                     'we are out of fuel and stranded', 'the drive is broken and we cannot move',
                     'we cannot steer or thrust', 'our thrusters do not work'],
      explosion:    ['the reactor is about to explode', 'our ship is going to blow up',
                     'the core is overloading and will detonate', 'we are moments from an explosion'],
      lifesupport:  ['life support is failing', 'we are running out of air to breathe',
                     'the oxygen is almost gone', 'the air recyclers have stopped working'],
      breach:       ['our hull is breached', 'we are losing atmosphere through a hole in the hull',
                     'the ship is decompressing', 'there is a crack in the hull and air is escaping'],
      attack:       ['we are under attack', 'someone is shooting at us', 'our ship is being fired on',
                     'we are taking damage from enemy weapons'],
      casualties:   ['crew members are badly injured', 'we have wounded people who need a doctor',
                     'someone aboard is dying', 'there is a medical emergency on board']
    },
    threat: {
      pirates:      ['pirates are attacking', 'raiders are after us', 'outlaws are waiting nearby',
                     'a pirate gang is hunting ships here'],
      patrol:       ['the police are chasing us', 'a navy warship is targeting us',
                     'the authorities are after us', 'a patrol cutter is pursuing our ship'],
      unknown:      ['an unknown ship is closing in', 'someone we cannot identify is following us',
                     'an unidentified vessel is approaching', 'a strange ship is attacking us']
    }
  };

  /* Measured, not guessed — tools/bench-reader.mjs on 2026-10-18, tuned on
   * half of test/reader-phrases.json and scored on the other half, five
   * models compared. MiniLM-L12 at these settings read 92.9% of held-out
   * claim slots (the matcher alone: 82.1%), 90.7% of paraphrases (77.3%)
   * and 91.7% of mixed messages (70.8%). `share` 0: a clause speaks to the
   * one slot it matches best.
   *
   * `skipFilled` is OFF because it lost. It was a fix for one sentence —
   * "We are dead in the water, kids aboard fleeing the war", whose drive
   * failure is still missed — and when eight such mixed messages were
   * added to the fixture and every model re-tuned, all five did better
   * without it. One anecdote does not outvote the measurement. */
  var EMBED = { tau: 0.44, margin: 0, mode: 'hybrid', share: 0, skipFilled: false };

  /* The live model, once embedder.js has one. Null means the matcher
   * reads alone — always true under node unless a test injects one. */
  var MODEL = { embed: null, protos: null, name: null };
  function useEmbedder(embed, protos, name) {
    MODEL.embed = embed; MODEL.protos = protos; MODEL.name = name || 'model';
  }
  function readerName() { return MODEL.embed ? MODEL.name : 'phrase matcher'; }

  function cosine(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;               // vectors arrive normalised
  }

  /* Split into clauses at sentence punctuation, commas, and the two
   * conjunctions that join separate claims. */
  function clauses(text) {
    return String(text || '')
      .split(/[.;!?,]+|\s+(?:and|but|plus)\s+/i)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 1; });
  }

  /* Embed every prototype once. `embed(texts)` resolves to an array of
   * normalised vectors. Returns the table embedRead needs. */
  function preparePrototypes(embed) {
    var flat = [];
    for (var slot in PROTOTYPES) {
      for (var val in PROTOTYPES[slot]) {
        PROTOTYPES[slot][val].forEach(function (s) { flat.push({ slot: slot, value: val, text: s }); });
      }
    }
    return embed(flat.map(function (f) { return f.text; })).then(function (vecs) {
      for (var i = 0; i < flat.length; i++) flat[i].v = vecs[i];
      return flat;
    });
  }

  /* text -> Promise of the same shape `read` returns.
   *
   * Three things learned from the first benchmark run, each a miss it made:
   *
   *  - A NEGATOR IS USUALLY PART OF THE TROUBLE. "We can't steer", "no
   *    thrust at all", "nothing in the hold" DESCRIBE a state; they do not
   *    deny one. So a model-read claim is a denial only when the anchor
   *    matcher saw that same value denied ("not carrying slaves", "no
   *    pirates out here"), where the negator is attached to the very word.
   *
   *  - ONE CLAUSE, ONE CLAIM (mostly). "We have wounded aboard" was read as
   *    casualties AND as people in the hold. A clause is given to the slot
   *    it matches best overall, and to another slot only if that one is
   *    within `share` of it — which still lets "raiders are firing on us"
   *    be both an attack and pirates.
   *
   *  - WHO WINS WHEN THEY DISAGREE is a measured choice (`mode`): the
   *    matcher first, the model first, or the model only when it is sure. */
  function embedRead(text, embed, protos, opts) {
    opts = opts || EMBED;
    var share = opts.share == null ? 0.04 : opts.share;
    var cl = clauses(text);
    var lex = read(text);
    if (!cl.length) return Promise.resolve(lex);
    return embed(cl).then(function (vecs) {
      var best = { cargo: null, situation: null, threat: null };
      for (var c = 0; c < cl.length; c++) {
        /* Best value per slot for this clause, and the runner-up. */
        var per = {};
        for (var p = 0; p < protos.length; p++) {
          var pr = protos[p];
          var s = cosine(vecs[c], pr.v);
          var slotTab = per[pr.slot] || (per[pr.slot] = {});
          if (!(slotTab[pr.value] >= s)) slotTab[pr.value] = s;
        }
        /* `skipFilled` (off — see EMBED): in hybrid mode, do not let a
         * clause spend itself on a slot the matcher already filled. Kept
         * as an option so the benchmark can keep testing it. */
        var tops = {}, globalTop = -1;
        for (var slot in per) {
          if (opts.mode === 'hybrid' && opts.skipFilled && lex[slot]) continue;
          var vals = Object.keys(per[slot]).sort(function (x, y) { return per[slot][y] - per[slot][x]; });
          tops[slot] = { value: vals[0], top: per[slot][vals[0]],
                         second: vals.length > 1 ? per[slot][vals[1]] : -1 };
          if (tops[slot].top > globalTop) globalTop = tops[slot].top;
        }
        for (var sl in tops) {
          var tp = tops[sl];
          if (tp.top < opts.tau || tp.top - tp.second < opts.margin) continue;
          if (tp.top < globalTop - share) continue;
          var lx = lex[sl];
          var neg = !!(lx && lx.neg && lx.value === tp.value);
          var cur = best[sl];
          var cand = { value: tp.value, label: WORDS[sl][tp.value] || tp.value, neg: neg,
                       score: tp.top, clause: cl[c], by: 'model' };
          if (!cur || (cur.neg && !neg) || (cur.neg === neg && tp.top > cur.score)) best[sl] = cand;
        }
      }
      if (opts.mode === 'model') return best;
      var out = {};
      ['cargo', 'situation', 'threat'].forEach(function (slot) {
        var lx = lex[slot], md = best[slot];
        if (opts.mode === 'sure') {
          /* The model overrides the matcher only when it is well clear of
           * the threshold; otherwise the matcher's exact word stands. */
          out[slot] = (md && (!lx || (md.score >= opts.tau + (opts.sure || 0.1) && md.value !== lx.value)))
                      ? md : (lx || md || null);
        } else {
          /* HYBRID: the anchor lists win wherever they matched (they name
           * the exact goods, which the truth check needs); the model fills
           * in what they missed. */
          out[slot] = lx || md || null;
        }
      });
      return out;
    });
  }

  /* The one-line summary Read-as shows. */
  function describeClaims(claims) {
    var parts = [];
    ['cargo', 'situation', 'threat'].forEach(function (slot) {
      var c = claims && claims[slot];
      if (!c) return;
      parts.push(slot + ' — ' + (c.neg ? 'NOT ' : '') + c.label);
    });
    return parts.length ? parts.join(' · ') : 'nothing the game could read as a claim';
  }

  /* ---- the truth ----------------------------------------------------------
   * What is actually so, read off the ship and the system. */
  function cargoValue(G) {
    var Eco = global.Economy, sum = 0, cargo = (G.ship && G.ship.cargo) || {};
    for (var cid in cargo) {
      if (!(cargo[cid] > 0)) continue;
      var c = Eco && Eco.BY_ID[cid];
      sum += cargo[cid] * Math.max(0, (c && c.base) || 0);
    }
    return sum;
  }

  function anyCargo(G) {
    var cargo = (G.ship && G.ship.cargo) || {};
    for (var cid in cargo) if (cargo[cid] > 0) return true;
    return false;
  }

  function contrabandAboard(G) {
    var Eco = global.Economy, cargo = (G.ship && G.ship.cargo) || {};
    for (var cid in cargo) {
      if (cargo[cid] > 0 && Eco && Eco.BY_ID[cid] && Eco.BY_ID[cid].contraband) return true;
    }
    return false;
  }

  /* Commodity named by an anchor, if it names one exactly. */
  var NAMED = { grain: 'grain', ore: 'ores', ores: 'ores', water: 'water', timber: 'timber',
                livestock: 'livestock', fish: 'fish', textiles: 'textiles', chemicals: 'chemicals',
                alloys: 'alloys', computers: 'computers', robotics: 'robotics', wine: 'wine',
                fruit: 'fruit', hydrogen: 'hydrogen', waste: 'waste', narcotics: 'narcotics',
                drugs: 'narcotics', 'gold buds': 'goldbuds', goldbuds: 'goldbuds',
                'restricted arms': 'arms', 'medical supplies': 'medical', medicine: 'medical',
                medicines: 'medical', 'rare metals': 'rare', 'luxury goods': 'luxuries',
                luxuries: 'luxuries', 'ai cores': 'aicores', 'gene therapies': 'genetech',
                'fusion cells': 'fusion', 'military fuel': 'milfuel', machinery: 'farmmach' };

  var PEOPLE = /refugee|fleeing|evacuee|evacuating|slave|children|families|survivors|civilians|colonists|passengers/;

  /* Is anyone hostile actually near? Read off the same ship list the radar
   * draws from — a claim of pirates is true if a pirate is close, not if
   * the player is merely having a bad day. */
  var THREAT_RANGE = 100000;   // km

  function hostilesNear(G, sys, t) {
    var Sim = global.Sim, out = { pirates: 0, patrol: 0, any: 0 };
    if (!Sim || !sys) return out;
    var list = Sim.shipsAll(sys, t), pos = G.ship.pos;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (V.dist(s.pos, pos) > THREAT_RANGE) continue;
      if (s.kind === 'pirate') { out.pirates++; out.any++; }
      else if ((s.kind === 'police' || s.kind === 'navy') && (s.hostileToPlayer ||
               (s.spec && s.spec.hostileToPlayer))) { out.patrol++; out.any++; }
    }
    if (G.encounter && G.encounter.demand) out.any = Math.max(out.any, 1);
    return out;
  }

  function hullFrac(G) {
    var s = G.ship || {};
    return s.hullMax ? (s.hullHp || 0) / s.hullMax : 1;
  }

  /* What is ACTUALLY wrong, as situation values. */
  function realSituations(G, sys, t) {
    var s = G.ship || {}, out = {};
    var Combat = global.Combat;
    var why = Combat && Combat.maydayReason ? Combat.maydayReason(G) : null;
    if (why === 'stranded' || why === 'nofuel') out.drive = true;
    var hf = hullFrac(G);
    if (hf <= 0.25) { out.breach = true; out.lifesupport = true; out.casualties = true; }
    if (hf <= 0.12) out.explosion = true;
    var h = hostilesNear(G, sys, t);
    if (h.any) out.attack = true;
    return out;
  }

  function inDistress(G, sys, t) {
    var r = realSituations(G, sys, t);
    for (var k in r) if (r[k]) return true;
    return false;
  }

  function truthOf(G, sys, t, slot, claim) {
    var s = G.ship || {}, cargo = s.cargo || {}, positive;
    if (slot === 'cargo') {
      var named = NAMED[claim.label];
      if (claim.value === 'humanitarian') {
        positive = named ? (cargo[named] || 0) > 0
                 : PEOPLE.test(claim.label) ? (s.passengers || 0) > 0
                 : (s.passengers || 0) > 0 || (cargo.medical || 0) > 0;
      } else if (claim.value === 'contraband') {
        positive = named ? (cargo[named] || 0) > 0 : contrabandAboard(G);
      } else if (claim.value === 'valuable') {
        positive = named ? (cargo[named] || 0) > 0 : cargoValue(G) >= 15000;
      } else if (claim.value === 'ordinary') {
        positive = named ? (cargo[named] || 0) > 0 : anyCargo(G);
      } else if (claim.value === 'none') {
        positive = !anyCargo(G) && !(s.passengers > 0);
      }
    } else if (slot === 'situation') {
      positive = !!realSituations(G, sys, t)[claim.value];
    } else if (slot === 'threat') {
      var h = hostilesNear(G, sys, t);
      positive = claim.value === 'pirates' ? h.pirates > 0
               : claim.value === 'patrol' ? h.patrol > 0 : h.any > 0;
    }
    return claim.neg ? !positive : !!positive;
  }

  /* Every claim, checked, with the prompt the design asks for when it is
   * false — and, for a distress call, the one question that comes before
   * all of them: are you actually in distress? */
  function check(G, sys, t, claims, kind) {
    var out = [];
    ['cargo', 'situation', 'threat'].forEach(function (slot) {
      var c = claims && claims[slot];
      if (!c) return;
      var ok = truthOf(G, sys, t, slot, c);
      out.push({ slot: slot, value: c.value, label: c.label, neg: c.neg, ok: ok,
                 prompt: ok ? null
                      : slot === 'cargo' ? 'This does not match your manifest'
                      : slot === 'situation' ? 'Your ship is not ' + (c.neg ? 'free of that' : WORDS.situation[c.value])
                      : 'There ' + (c.neg ? 'are' : 'are no') + ' ' + WORDS.threat[c.value] + ' near you' });
    });
    if (kind === 'distress' && !inDistress(G, sys, t)) {
      out.unshift({ slot: 'distress', ok: false, label: 'distress', prompt: 'Ship not in distress' });
    }
    var lies = out.filter(function (x) { return !x.ok; });
    return { items: out, lies: lies, honest: lies.length === 0, weight: weighLie(lies) };
  }

  /* ---- weighing a lie -------------------------------------------------------
   * Two axes, from the design. WHAT IT EXPLOITS: compassion (people in the
   * hold, wounded aboard) is the worst betrayal; greed (valuable or
   * contraband cargo) draws opportunists; duty (an attack, a threat) draws
   * the law. WHAT IT COSTS RESPONDERS: false danger lures rescuers close;
   * false combat brings guns expecting a fight; a cargo fib is cheap.
   *
   * "Carrying freed slaves, drive about to explode" when neither is true
   * exploits compassion AND endangers rescuers — among the worst lies there
   * are, and remembered as EXPLOITED_COMPASSION. */
  var DANGER = { explosion: 3, breach: 3, lifesupport: 3, drive: 2, casualties: 2 };

  function weighLie(lies) {
    var compassion = false, greed = false, duty = false, cost = 0;
    lies.forEach(function (l) {
      if (l.slot === 'distress') { cost = Math.max(cost, 2); return; }
      if (l.slot === 'cargo') {
        if (l.value === 'humanitarian' && !l.neg) compassion = true;
        if ((l.value === 'valuable' || l.value === 'contraband') && !l.neg) greed = true;
        cost = Math.max(cost, 1);
      } else if (l.slot === 'situation') {
        if (l.value === 'casualties') compassion = true;
        if (l.value === 'attack') { duty = true; cost = Math.max(cost, 2); }
        else cost = Math.max(cost, DANGER[l.value] || 1);
      } else if (l.slot === 'threat') {
        duty = true; cost = Math.max(cost, 2);
      }
    });
    var severity = lies.length ? cost * (compassion ? 1.5 : 1) : 0;
    return { compassion: compassion, greed: greed, duty: duty, cost: cost, severity: severity,
             event: !lies.length ? null : (compassion && cost >= 2) ? 'exploited' : 'lied' };
  }

  /* ---- composing a call -----------------------------------------------------
   * The other direction: claims to words, for NPC calls. Kept in step with
   * the reader by a test that reads every composed call back. */
  var SAY = {
    situation: { drive: ['Drive failure, we are drifting.', 'Our drive is dead and we are adrift.'],
                 breach: ['Hull breach, we are venting atmosphere.', 'We are holed and venting.'],
                 lifesupport: ['Life support is failing.', 'We are running out of air.'],
                 casualties: ['We have wounded aboard.', 'Crew injured, we need a doctor.'],
                 explosion: ['Reactor going critical.', 'We are about to blow.'],
                 attack: ['We are under attack.', 'We are taking fire.'] },
    cargo: { humanitarian: ['We have refugees aboard.', 'Carrying medical supplies.',
                            'We have passengers aboard, families.'],
             valuable: ['Hold full of luxury goods.', 'Carrying rare metals.'],
             ordinary: ['Carrying freight.'] },
    close: ['Please, anyone.', 'Requesting immediate assistance.', 'Any ship, please respond.',
            'Mayday, mayday.']
  };

  function compose(claims, seed) {
    var h = RNG.hashString(String(seed || 'x'));
    var bits = [];
    if (claims.situation && SAY.situation[claims.situation.value]) {
      var a = SAY.situation[claims.situation.value];
      bits.push(a[h % a.length]);
    }
    if (claims.cargo && SAY.cargo[claims.cargo.value]) {
      var b = SAY.cargo[claims.cargo.value];
      bits.push(b[(h >> 4) % b.length]);
    }
    bits.push(SAY.close[(h >> 8) % SAY.close.length]);
    return bits.join(' ');
  }

  /* ---- drafts: the Read-as step ---------------------------------------------
   * A draft is what the player has typed and what it was read as, waiting
   * on the confirmation. It lives on G so the comms page can show it as a
   * modal set of rows; it is never saved — an unsent message is not a
   * career fact. */
  function draft(G, sys, t, kind, text, target) {
    var claims = read(text);
    var d = G.msgDraft = { kind: kind, text: text, claims: claims,
                           check: check(G, sys, t, claims, kind),
                           target: target ? (target.name || null) : null,
                           targetRef: target || null, at: t, reader: 'phrase matcher' };
    /* WITH THE MODEL, the draft is held as "reading" for the few
     * milliseconds the model takes, then replaced with its reading. If the
     * player has moved on (a newer draft, or cancelled) the late answer is
     * dropped rather than resurrecting a message they abandoned. */
    if (MODEL.embed) {
      d.pending = true;
      embedRead(text, MODEL.embed, MODEL.protos).then(function (c) {
        if (G.msgDraft !== d) return;
        d.claims = c;
        d.check = check(G, sys, G.t, c, kind);
        d.reader = MODEL.name;
        d.pending = false;
      }, function () {
        if (G.msgDraft === d) d.pending = false;   // the matcher's reading stands
      });
    }
    return d;
  }

  /* ---- who answers a distress call ----------------------------------------
   * Captains weigh the claim against their VALUES, plus distance, how they
   * feel about you, and whether they believe you. An abolitionist races in
   * for people in a hold; a pirate-minded captain may come for very
   * different reasons; profit-first comes for valuable cargo or not at all.
   */
  var AU = 1.495978707e8;
  var RESPOND_MIN = 1.6;
  var MAX_RESPONDERS = 3;
  var NPC_ACCEL = 0.012;      // km/s^2, ~1.2 g — the arithmetic a responder quotes

  function desireFor(G, sys, contact, claims, dist) {
    var Cap = global.Captains;
    var op = Cap.opinion(G, sys, contact);
    if (!op) return null;
    var p = op.profile, d = 0, prey = false;
    var c = claims.cargo && !claims.cargo.neg ? claims.cargo.value : null;
    var s = claims.situation && !claims.situation.neg ? claims.situation.value : null;
    var th = claims.threat && !claims.threat.neg ? claims.threat.value : null;

    if (c === 'humanitarian') {
      d += p.values === 'abolitionist' ? 3 : p.values === 'lawful' ? 1 : 0;
      if (p.values === 'pirate') { d += 2; prey = true; }
      if (p.temper === 'principled') d += 1;
      if (p.temper === 'friendly') d += 0.5;
    }
    if (c === 'valuable' || c === 'contraband') {
      if (p.values === 'pirate') { d += 2.5; prey = true; }
      if (p.values === 'profit') d += 1.5;
      if (c === 'contraband' && p.values === 'lawful') d += 1;
    }
    if (s && s !== 'attack') {
      d += p.temper === 'principled' || p.temper === 'friendly' ? 1.5 : 0;
      d += p.values === 'lawful' || p.values === 'abolitionist' ? 1 : p.values === 'profit' ? 0.3 : 0;
      if (p.temper === 'mercenary') d -= 0.5;
      if (p.values === 'pirate') { d += 0.5; prey = true; }
    }
    if (s === 'attack' || th === 'pirates' || th === 'unknown') {
      d += (p.role === 'police' || p.role === 'navy') ? 3 : 0;
      d += p.values === 'lawful' ? 1.5 : 0;
      if (p.values === 'pirate') d -= 2;
      if (p.temper === 'wary') d -= 1;
    }
    d += Math.max(-2, Math.min(2, op.score * 0.25));
    /* BELIEF. A captain you have lied to before discounts what you say. */
    var hon = op.memory ? (op.memory.honesty || 0) : 0;
    if (hon < 0) d *= Math.max(0.2, 1 + hon / 10);
    d -= Math.min(3, (dist / AU) * 2);
    return { desire: d, prey: prey, profile: p, opinion: op };
  }

  function etaFor(dist) {
    return 300 + 2 * Math.sqrt(Math.max(0, dist) / NPC_ACCEL);
  }

  var ACK = {
    help: ['Hold on, we are coming. {eta} out.', 'Copy your mayday. Inbound, {eta}.',
           'On our way. Sit tight, {eta}.'],
    prey: ['Hold position. We are coming to have a look. {eta}.',
           'Stay right where you are. {eta}.'],
    law: ['This is the law. Responding, {eta} out. Keep your guns cold.']
  };

  function fmtEta(s) {
    if (s < 90) return Math.round(s) + ' seconds';
    if (s < 5400) return Math.round(s / 60) + ' minutes';
    return (s / 3600).toFixed(1) + ' hours';
  }

  /* Send the player's distress call. Returns the broadcast record. */
  function sendDistress(G, sys, t, d, hooks) {
    var Cap = global.Captains, Sim = global.Sim, Combat = global.Combat;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 7); }
    var chk = check(G, sys, t, d.claims, 'distress');
    var b = {
      id: 'b' + Math.round(t) + '-' + (RNG.hashString(d.text) % 1000),
      at: t, star: G.here ? G.here.id : null,
      pos: V.clone(G.ship.pos), text: d.text, claims: d.claims,
      lies: chk.lies.map(function (l) { return { slot: l.slot, value: l.value, label: l.label, neg: l.neg }; }),
      weight: chk.weight, ident: Cap.identity(G).key, responders: []
    };

    /* Candidates: every captain in the system who can hear it. */
    var list = Sim.shipsAll(sys, t), cands = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.hostile || !Cap.hasCaptain(c)) continue;
      if (c.cls === 'capital' || c.kind === 'capital') continue;
      var dist = V.dist(c.pos, G.ship.pos);
      var w = desireFor(G, sys, c, d.claims, dist);
      if (!w || w.desire < RESPOND_MIN) continue;
      cands.push({ c: c, w: w, dist: dist });
    }
    cands.sort(function (x, y) { return y.w.desire - x.w.desire; });
    cands = cands.slice(0, MAX_RESPONDERS);

    cands.forEach(function (k) {
      var eta = etaFor(k.dist);
      var key = Cap.keyOf(G, sys, k.c);
      var role = k.w.profile.role;
      var tone = (role === 'police' || role === 'navy') ? 'law' : k.w.prey ? 'prey' : 'help';
      b.responders.push({ key: key, name: k.c.name, speaker: k.w.profile.title + ' ' + k.w.profile.family,
                          ref: refOf(k.c), etaAt: t + eta, prey: !!k.w.prey, arrived: false });
      var lines = ACK[tone];
      var line = lines[RNG.hashString(key + '|' + b.id) % lines.length].replace('{eta}', fmtEta(eta));
      say(k.w.profile.title + ' ' + k.w.profile.family + ', ' + k.c.name + ': "' + line + '"', 8);
    });
    if (!cands.length) say('Nobody answers. The band hisses.', 6);

    /* AN HONEST CALL FROM A SHIP REALLY IN TROUBLE also goes out through
     * the existing mayday, so the tender or the cutter that machinery
     * dispatches still comes. One machinery for real help; this file adds
     * who else hears you and what they think of what you said. */
    if (chk.honest && inDistress(G, sys, t) && Combat && Combat.mayday &&
        !(G.distress || []).some(function (x) { return x.mine; })) {
      var want = (d.claims.situation && d.claims.situation.value === 'attack') ||
                 (d.claims.threat && !d.claims.threat.neg) ? Combat.HELP_SECURITY : Combat.HELP_TENDER;
      Combat.mayday(sys, G, t, want, { say: function () {}, sound: hooks && hooks.sound });
    }

    (G.broadcasts = G.broadcasts || []).push(b);
    while (G.broadcasts.length > 6) G.broadcasts.shift();
    G.msgDraft = null;
    return b;
  }

  /* A saveable handle to a contact: enough to find it again. */
  function refOf(c) {
    var spec = c.spec || null;
    if (spec && spec.liftedFrom) return { route: spec.liftedFrom.id };
    if (spec) return { spec: spec.id };
    if (c.route && c.route.id) return { route: c.route.id };
    return { id: c.id || null };
  }

  function contactOf(sys, ref) {
    if (!ref || !sys) return null;
    var i;
    if (ref.route) {
      for (i = 0; i < (sys.traffic || []).length; i++) {
        if (sys.traffic[i].id === ref.route) return { route: sys.traffic[i], id: ref.route,
                                                      name: sys.traffic[i].name };
      }
    }
    if (ref.spec) {
      for (i = 0; i < (sys.patrols || []).length; i++) {
        if (sys.patrols[i].id === ref.spec) return sys.patrols[i];
      }
    }
    return null;
  }

  /* ---- arrivals: where lies are discovered --------------------------------
   * A responder that arrives looks. A false SITUATION is plain to see (no
   * fire, no drift); a false THREAT is plain to see (nobody there); a false
   * CARGO claim is found only by a captain who scans the hold — the law
   * always does, the principled usually do, the rest about half the time.
   * A found lie is a SEEN lie: dials drop, the memorable tag is set, and
   * (step 5) a rumour leaves with them at ship speed. */
  var SCENE_RANGE = 150000;   // km — the witness range; further is "not there"

  function arrive(G, sys, t, b, r, hooks) {
    var Cap = global.Captains;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 8); }
    r.arrived = true;
    var contact = contactOf(sys, r.ref);
    if (!contact) return;
    var p = Cap.profile(G, sys, contact);
    var here = V.dist(G.ship.pos, b.pos) <= SCENE_RANGE;
    var found = [];
    ['cargo', 'situation', 'threat', 'distress'].forEach(function (slot) {
      var lie = (b.lies || []).filter(function (l) { return l.slot === slot; })[0];
      if (!lie) return;
      /* Still a lie when they get here? A ship that has since really run
       * dry was not lying about drifting. Re-checked against now. */
      if (slot !== 'distress' && b.claims[slot] && truthOf(G, sys, t, slot, b.claims[slot])) return;
      if (slot === 'distress' && inDistress(G, sys, t)) return;
      if (slot === 'cargo') {
        var scans = p.role === 'police' || p.role === 'navy' || p.values === 'lawful' ||
                    (p.temper === 'principled' && RNG.hashString('scan|' + r.key + b.id) % 4 !== 0) ||
                    RNG.hashString('scan|' + r.key + b.id) % 2 === 0;
        if (!scans || !here) return;
      }
      found.push(lie);
    });

    if (!here) {
      Cap.record(G, sys, contact, 'wasted', t);
      say(r.speaker + ', ' + r.name + ': "We are at your position and you are not. Thanks for nothing."', 8);
      return;
    }
    if (found.length) {
      /* ONE THREAD PULLS THE WHOLE CALL. A responder who catches a false
       * emergency (or a threat that is not there) knows the call was bait,
       * and judges it by everything it claimed — they came because you
       * said there were refugees aboard, whether or not they scan the hold
       * to prove there were not. Only a lone cargo fib, found by a scan,
       * is judged on its own. */
      var exposed = found.some(function (l) { return l.slot !== 'cargo'; });
      var w = exposed ? weighLie(b.lies) : weighLie(found);
      /* Logged with your own words, so they can say them back to you:
       * "You said 'refugees aboard'. I came. None of it was true." */
      Cap.record(G, sys, contact, w.event, t,
                 { q: b.text, log: w.event === 'exploited' ? 'exploited' : 'liedCall' });
      Cap.bumpRecord(G, 'lies', 1, { sys: sys, ship: contact, t: t });
      if (w.compassion) Cap.bumpRecord(G, 'cruelLies', 1, { sys: sys, ship: contact, t: t });
      r.foundLie = w.event;
      if (global.Captains._onLieFound) global.Captains._onLieFound(G, sys, t, contact, w, b);
      say(r.speaker + ', ' + r.name + ': "' + (w.event === 'exploited'
            ? 'There is nobody dying here. You used that to drag us out. Everyone will hear about this.'
            : 'That is not what you said. I will remember it.') + '"', 9);
      return;
    }
    /* TRUTHFUL. They came; you were straight with them. */
    Cap.record(G, sys, contact, 'honest', t, { log: 'cameForYou', q: b.text });
    var real = realSituations(G, sys, t);
    if (real.drive && G.ship) {
      var s = G.ship;
      if (s.thrusterCap) s.thrusterFuel = Math.min(s.thrusterCap, (s.thrusterFuel || 0) + s.thrusterCap * 0.25);
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      if (Cap.addDebt) Cap.addDebt(G, sys, contact, -1, t, 'helped you');
      say(r.speaker + ', ' + r.name + ': "' + (r.prey ? 'Lucky for you we are feeling generous.'
                                                       : 'Hose is across. That should get you moving.') + '"', 8);
    } else {
      if (Cap.addDebt) Cap.addDebt(G, sys, contact, -1, t, 'came when you called');
      say(r.speaker + ', ' + r.name + ': "' + (r.prey ? 'Looks like you will live. Pity.'
                                                       : 'We are here. Looks like you are holding together.') + '"', 8);
    }
  }

  /* ---- NPC distress calls ---------------------------------------------------
   * The band is not only yours. A captain calls for help: a real trader in
   * real trouble — the rescue the design wants you able to make — and,
   * where pirates work the lanes, sometimes a pirate pretending to be one,
   * transmitting from where it actually lurks. The ambush is the pirate's
   * own intercept (Sim.wakeNpc), triggered by you flying to it; nothing
   * new is spawned.
   *
   * THE REAL ONES ARE upkeep.js's NOW (2026-10-30). This schedule used to
   * put real traders on the band as well, and they were phantoms: the call
   * said adrift while the ship it named flew on along her timetable, and
   * "answering" was a thank-you with nobody there. A real mayday is now a
   * ship whose tank actually let go, adrift where the call says, until you
   * or a tug get to her. What is left here is the bait, at the rate that
   * keeps it about the share of the band it always was where pirates work
   * (roughly half: upkeep puts a real ship adrift every five days or so in
   * a typical system, and this a lure about as often).
   *
   * STATELESS. Whether a call is on the band at time t is a pure function
   * of (seed, star, slot): it is pushed when t is inside its window and is
   * not already there, so a reload, a jump out and back, or time warp all
   * agree. */
  var NPC_SLOT = 4 * 3600;      // s — one chance of a call per four hours
  var NPC_CHANCE = 0.03;        // of slots, a lure, where pirates work
  var NPC_LIFE = 5400;          // s — an hour and a half on the band

  function npcCallFor(G, sys, slot) {
    var Sim = global.Sim;
    if (!sys || !sys.traffic || !sys.traffic.length) return null;
    var starId = (sys.starId) || (G.here && G.here.id) || 'here';
    var rng = new RNG('npcmayday|' + G.seed + '|' + starId + '|' + slot);
    if (!rng.chance(NPC_CHANCE)) return null;
    var fireAt = slot * NPC_SLOT + rng.range(0, NPC_SLOT * 0.6);

    var pirates = (sys.patrols || []).filter(function (p) { return p.kind === 'pirate' && !p.dead; });
    if (!pirates.length) return null;
    var fake = true;
    var routes = sys.traffic.filter(function (r) { return r.kind !== 'fleet' && !r.suppressed; });
    if (!routes.length) return null;
    var call = { npc: true, fake: fake, slot: slot, from: 'npc|' + starId + '|' + slot,
                 at: fireAt, until: fireAt + NPC_LIFE, mine: false, want: 'tender',
                 cls: 'ship', kind: 'mayday', answeredBy: null };
    if (fake) {
      var pirate = pirates[rng.int(0, pirates.length - 1)];
      call.pirateId = pirate.id;
      /* The lie a predator tells: people in the hold or money in it, and
       * a reason to come close. Exactly the worst kind, on purpose. */
      var lureCargo = rng.chance(0.6) ? 'humanitarian' : 'valuable';
      call.claims = { situation: { value: rng.pick(['drive', 'explosion', 'breach']), label: '', neg: false },
                      cargo: { value: lureCargo, label: '', neg: false } };
      call.name = FAKE_NAMES[rng.int(0, FAKE_NAMES.length - 1)];
      /* Half the time the transponder is a real ship's, copied. That is
       * the tell a careful pilot can check: the registry knows where the
       * real one is. */
      var copied = rng.chance(0.5) ? routes[rng.int(0, routes.length - 1)] : null;
      call.copiedRoute = copied ? copied.id : null;
      call.reg = copied ? (copied.reg || (Sim.regCode ? Sim.regCode(copied.id) : null))
                        : (Sim.regCode ? Sim.regCode('fake|' + G.seed + '|' + slot) : null);
    }
    call.text = compose(call.claims, call.from);
    return call;
  }

  var FAKE_NAMES = ['Mercy of Halden', 'Quiet Harbour', 'Lantern Packet', 'Saltmarsh Tern',
                    'Pilgrim Courier', 'Good Shepherd', 'Juno Clipper', 'Northstar Heron'];

  /* Where the caller is NOW. A distress beacon keeps transmitting, so the
   * scene follows the transmitter: a real caller adrift where it called,
   * a pirate wherever its loiter has carried it — which is what makes the
   * ambush happen when you get there. */
  function callerPos(G, sys, t, call) {
    var Sim = global.Sim;
    if (call.fake && call.pirateId) {
      var list = Sim.shipsAll(sys, t);
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s.spec && s.spec.id === call.pirateId) return s.spec.live ? s.spec.live.pos : s.pos;
      }
      return null;
    }
    if (call.routeId) {
      var route = (sys.traffic || []).filter(function (r) { return r.id === call.routeId; })[0];
      if (route) return Sim.trafficState(route, sys, call.at).pos;
    }
    return null;
  }

  function updateNpcCalls(G, sys, t) {
    if (!sys || !G.ship || G.hyper) return;
    var slot = Math.floor(t / NPC_SLOT);
    var list = (G.distress = G.distress || []);
    /* This slot and the last, because a call fired near the end of one
     * slot is still live in the next. */
    for (var sl = slot - 1; sl <= slot; sl++) {
      if (sl < 0) continue;
      var call = npcCallFor(G, sys, sl);
      if (!call || t < call.at || t >= call.until) continue;
      var have = null;
      for (var i = 0; i < list.length; i++) if (list[i].from === call.from) { have = list[i]; break; }
      if (have) {
        /* A saved call comes back without the fields Save does not know
         * about. Restore them from the schedule, which is the truth. */
        if (!have.npc) {
          for (var k in call) if (have[k] === undefined) have[k] = call[k];
          have.npc = true;
        }
        call = have;
      } else {
        var p0 = callerPos(G, sys, t, call);
        if (!p0) continue;
        call.pos = V.clone(p0);
        list.push(call);
        while (list.length > 8) list.shift();
      }
      /* The beacon follows the transmitter (see callerPos). Updated in
       * place, so a nav mark on the scene follows it too. */
      if (call.fake && !call.answeredBy) {
        var p = callerPos(G, sys, t, call);
        if (p && call.pos) { call.pos.x = p.x; call.pos.y = p.y; call.pos.z = p.z; }
      }
    }
  }

  /* Check a call's transponder against the registry. True to the world:
   * a real caller's registration is on file and on the run it says; a
   * copied one is on file but its ship is somewhere else entirely; an
   * invented one is not on file at all. */
  function checkTransponder(G, sys, t, call) {
    var Sim = global.Sim;
    if (!call || !call.npc) return 'Registered, and transmitting from where the registry expects.';
    if (!call.fake) {
      if (call.upkeep) {
        return 'Registered to the ' + call.name + ', off her timetable since her tank went. ' +
               'The beacon is where her last position report says she is. It checks out.';
      }
      return 'Registered to the ' + call.name + ', on her timetabled run. It checks out.';
    }
    if (call.copiedRoute) {
      var route = (sys.traffic || []).filter(function (r) { return r.id === call.copiedRoute; })[0];
      if (!route) return 'Registered to a ship this registry has no current record of.';
      var st = Sim.trafficState(route, sys, t);
      var dd = call.pos ? V.dist(st.pos, call.pos) : 0;
      return 'Registered to the ' + route.name + ' — whose timetable puts her ' +
             fmtKm(dd) + ' from that beacon.';
    }
    return 'No ship by that registration is on file in this system.';
  }

  function fmtKm(km) {
    if (km >= AU * 0.05) return (km / AU).toFixed(2) + ' AU';
    if (km >= 10000) return Math.round(km / 1000) + 'k km';
    return Math.round(km) + ' km';
  }

  /* Answering one: called by Combat.answerDistress for an NPC call. */
  function answerNpcCall(sys, G, t, call, hooks) {
    var Cap = global.Captains;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 7); }
    /* A SHIP THAT IS REALLY ADRIFT (upkeep.js). Answering is passing her
     * mass, which takes being alongside; a part-load leaves the call open
     * so the next trip can finish it. */
    if (call.upkeep && global.Upkeep) {
      var her = (sys.traffic || []).filter(function (r) { return r.id === call.routeId; })[0];
      if (!her) return { ok: false, why: 'she is not on the registry any more' };
      var tr = global.Upkeep.transfer(G, sys, t, her, hooks);
      if (tr.ok && tr.done) call.answeredBy = 'player';
      return tr;
    }
    var reach = V.dist(G.ship.pos, call.pos);
    if (reach > SCENE_RANGE) return { ok: false, why: 'too far from the scene to be any use' };
    call.answeredBy = 'player';
    if (call.fake) {
      say('Nobody is drifting here. Whatever called is not on any timetable — and it is waking up.', 8);
      return { ok: true, fake: true };
    }
    var route = (sys.traffic || []).filter(function (r) { return r.id === call.routeId; })[0];
    var contact = route ? { route: route, id: route.id, name: route.name } : null;
    if (contact) {
      /* WHAT YOU SAVED, from what their own call said was at stake —
       * "you saved my cargo and my crew, not to mention my ship." */
      var st = [], cl = call.claims || {};
      if (cl.cargo && cl.cargo.value === 'humanitarian') st.push('passengers');
      else if (cl.cargo) st.push('cargo');
      if (cl.situation && /casualties|lifesupport|breach/.test(cl.situation.value)) st.push('crew');
      st.push('ship');
      Cap.record(G, sys, contact, 'rescued', t, { stakes: st });
      if (Cap.addDebt) Cap.addDebt(G, sys, contact, 1, t, 'you saved her');
    }
    Cap.bumpRecord(G, 'rescues', 1, contact ? { sys: sys, ship: contact, t: t } : null);
    var fac = null;
    if (route && sys.byId && sys.byId[route.from]) fac = sys.byId[route.from].faction || null;
    if (fac && global.Missions && global.Missions.bumpStanding) global.Missions.bumpStanding(G, fac, 8);
    var p = contact ? Cap.profile(G, sys, contact) : null;
    say((p ? p.title + ' ' + p.family + ', ' : '') + call.name + ': "You came. We will not forget this."', 8);
    return { ok: true, fake: false, faction: fac };
  }

  /* ---- talking to one ship ------------------------------------------------
   * Send a message (your own words) or ask what they carry and where. The
   * reply is built from the captain's REAL state, their dials toward you,
   * and their temper — a wary captain may say "None of your business." */
  var SCAN_RANGE = 60;      // km — close enough to read a hold

  function sendMessage(G, sys, t, contact, d, hooks) {
    var Cap = global.Captains;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 8); }
    G.msgDraft = null;
    var op = Cap.opinion(G, sys, contact);
    if (!op) { say(contact.name + ' does not answer.', 4); return null; }
    var p = op.profile, who = p.title + ' ' + p.family + ', ' + contact.name + ': "';
    var chk = check(G, sys, t, d.claims, 'message');
    var close = contact.pos && V.dist(contact.pos, G.ship.pos) <= SCAN_RANGE;
    var scans = close && (p.role === 'police' || p.role === 'navy' || p.values === 'lawful');
    Cap.noteMet(G, sys, contact, t);

    if (chk.lies.length && scans) {
      var w = weighLie(chk.lies);
      Cap.record(G, sys, contact, w.event === 'exploited' ? 'exploited' : 'lied', t,
                 { q: d.text, log: w.event === 'exploited' ? 'exploited' : 'lied' });
      Cap.bumpRecord(G, 'lies', 1, { sys: sys, ship: contact, t: t });
      say(who + 'We are close enough to read your hold. That is not what is in it."', 8);
      return { caught: true };
    }
    if (op.band === 'furious' || (op.band === 'angry' && p.temper !== 'friendly')) {
      say(who + 'I am not interested in anything you have to say."', 6);
      return { refused: true };
    }
    var c = d.claims;
    /* THEY KEEP YOUR WORDS. A true warning about pirates is remembered as
     * one ("You warned me, and you were right"); anything else as what
     * you told them. Truth is the game's to know, read at the moment. */
    var warnedTrue = c.threat && !c.threat.neg && chk.honest;
    Cap.record(G, sys, contact, warnedTrue ? 'honest' : 'told', t,
               { q: d.text, log: warnedTrue ? 'warned' : 'told' });
    var line = null;
    if (c.cargo && !c.cargo.neg && c.cargo.value === 'humanitarian') {
      line = p.values === 'abolitionist' ? 'Then you have friends out here. Fly safe.'
           : p.values === 'pirate' ? 'People in your hold. Worth knowing.'
           : p.values === 'lawful' ? 'Make sure their papers are in order.' : 'Good of you.';
    } else if (c.cargo && !c.cargo.neg && c.cargo.value === 'contraband') {
      line = p.values === 'lawful' || p.role === 'police' ? 'You just told the wrong ship that.'
           : p.values === 'pirate' ? 'Now you are speaking my language.' : 'I did not hear that.';
    } else if (c.threat && !c.threat.neg && c.threat.value === 'pirates') {
      line = p.role === 'police' || p.role === 'navy' ? 'Noted. We will keep our eyes open.'
           : p.values === 'pirate' ? 'Are there now.' : 'Thanks for the warning.';
    } else if (c.situation && !c.situation.neg) {
      line = 'If you are in trouble, use the distress band. Everyone listens there.';
    } else if (c.cargo && !c.cargo.neg && c.cargo.value === 'valuable') {
      line = p.values === 'pirate' ? 'Is that so. Interesting.' : 'Lucky you. Mind the lanes.';
    }
    if (!line) line = p.temper === 'gruff' ? 'Copy.' : p.temper === 'wary' ? 'Understood.' : 'Copy that. Fair winds.';
    say(who + line + '"', 8);
    return { line: line };
  }

  /* "What are you carrying, and where to?" The answer is TRUE when it is
   * given — off the route's manifest and destination — and given or not by
   * temper and feeling. */
  function askCargo(G, sys, t, contact, hooks) {
    var Cap = global.Captains, Eco = global.Economy;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 8); }
    var op = Cap.opinion(G, sys, contact);
    if (!op) { say(contact.name + ' does not answer.', 4); return null; }
    var p = op.profile, who = p.title + ' ' + p.family + ', ' + contact.name + ': "';
    Cap.noteMet(G, sys, contact, t);
    var refuse = op.band === 'furious' || op.band === 'angry' ||
                 (p.temper === 'wary' && (op.band === 'cold' || op.band === 'neutral')) ||
                 p.role === 'pirate';
    if (refuse) {
      say(who + (p.role === 'pirate' ? 'Come and find out.'
                 : p.temper === 'mercenary' ? 'That information has a price, and you cannot afford it.'
                 : 'None of your business.') + '"', 6);
      return { refused: true };
    }
    var man = contact.manifest || [];
    var top = man.slice().sort(function (a, b) { return (b.qty || 0) - (a.qty || 0); })[0];
    var what = top ? Math.round(top.qty) + ' tonnes of ' +
               ((Eco && Eco.BY_ID[top.cid] && Eco.BY_ID[top.cid].name) || top.cid).toLowerCase()
             : 'nothing much';
    var where = contact.to && contact.to.name ? contact.to.name
              : (p.role === 'police' || p.role === 'navy') ? 'wherever the patrol takes us' : 'somewhere';
    var line = (p.role === 'police' || p.role === 'navy')
      ? 'We carry the law, pilot. Patrolling ' + (contact.from && contact.from.name ? 'off ' + contact.from.name : 'this system') + '.'
      : 'Carrying ' + what + ', bound for ' + where + '.';
    say(who + line + '"', 8);
    return { line: line };
  }

  /* ---- the tick -------------------------------------------------------------
   * Called once a frame from main.js after Combat.update. Cheap: one
   * schedule lookup, and a walk of at most six broadcasts. */
  function update(sys, G, t, hooks) {
    if (!G || !sys) return;
    updateNpcCalls(G, sys, t);
    /* The real ones: ships whose tanks have actually let go (upkeep.js). */
    if (global.Upkeep) global.Upkeep.updateCalls(G, sys, t);
    var bs = G.broadcasts || [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.star && G.here && b.star !== G.here.id) continue;
      for (var j = 0; j < b.responders.length; j++) {
        var r = b.responders[j];
        if (!r.arrived && t >= r.etaAt) arrive(G, sys, t, b, r, hooks);
      }
    }
  }

  var Messages = {
    read: read, describeClaims: describeClaims, embedRead: embedRead,
    useEmbedder: useEmbedder, readerName: readerName,
    preparePrototypes: preparePrototypes, clauses: clauses, PROTOTYPES: PROTOTYPES, EMBED: EMBED, check: check, truthOf: truthOf,
    weighLie: weighLie, compose: compose, draft: draft,
    sendDistress: sendDistress, sendMessage: sendMessage, askCargo: askCargo,
    desireFor: desireFor, etaFor: etaFor, update: update, arrive: arrive,
    npcCallFor: npcCallFor, updateNpcCalls: updateNpcCalls, checkTransponder: checkTransponder,
    answerNpcCall: answerNpcCall, realSituations: realSituations, inDistress: inDistress,
    hostilesNear: hostilesNear, contactOf: contactOf,
    ANCHORS: ANCHORS, WORDS: WORDS, NPC_SLOT: NPC_SLOT, NPC_LIFE: NPC_LIFE,
    SCENE_RANGE: SCENE_RANGE, RESPOND_MIN: RESPOND_MIN
  };
  global.Messages = Messages;
  if (typeof module !== 'undefined' && module.exports) module.exports = Messages;
})(typeof window !== 'undefined' ? window : globalThis);
