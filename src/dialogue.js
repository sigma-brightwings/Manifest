/* dialogue.js — talking to people on foot (2026-10-25).
 *
 * Astra: "let's make sure we have some more complex dialogue trees for
 * NPCs, based on a few rules which already exist for the comms traffic."
 * Asked which rules, she chose all four, and that talk should feed the
 * systems the game already has rather than a new economy:
 *
 *   TEMPER AND VALUES. Everybody gets a temper (how they talk) and values
 *   (what they care about), drawn with the same weights captains.js uses
 *   for a ship's chair — a port's own officers lean lawful, a Syndicate
 *   enforcer leans pirate, a hand in the crew hall is a cross-section.
 *
 *   THEIR OPINION OF YOU. Judged by Captains.judge, the very function a
 *   captain on the band reads you through: what they have SEEN you do (their
 *   own memory) beats what they have HEARD. A station's people have heard
 *   what their port has heard (Rumours.tallyAt on the port); a docked
 *   ship's crew speak for their captain (Captains.opinion off her route);
 *   your own crew know your whole record, because they were there.
 *
 *   MEMORY, AND NO REPEATS. Each person keeps a small memory of you —
 *   `G.people[id]`, saved — with the same dials (feeling, honesty), a log
 *   of what happened between you, and the hashes of every line they have
 *   said to you. They bring the log up, and they never use the same line
 *   on you twice until they have run out.
 *
 *   LIES ARE CHECKED. An answer that makes a claim — "medical supplies" —
 *   is the comms page's claim, checked by Messages.check against the real
 *   ship. Customs and marines always read your manifest; a lawful officer
 *   can pull it from the port; anyone else takes your word. A caught lie
 *   goes in their memory and on your public record, as it does on the band.
 *
 *   WHAT TALK CAN DO, using what is already there: pay a warrant
 *   (Combat.payBounty), buy a port's goodwill from a fixer
 *   (Combat.bribePort), hire a hand on terms you talked them to
 *   (Crew.dailyWage reads `wageMul`), hear what the port is saying about you
 *   (Rumours), ask a docked crew what their captain thinks of you and
 *   whether she owes you (Captains, Favours), read the market off a clerk
 *   (Economy.priceList), and buy a round, which is how a bartender comes to
 *   like you.
 *
 * Plain IIFE on `global`. Pure where it can be: who someone is and what they
 * think of you are functions of the seed and the save. Only `choose` and
 * `open` write (memory, credits, crew, the record), and only through the
 * modules that own those things.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;
  function Cap() { return global.Captains; }
  function hash(s) { return (RNG && RNG.hashString ? RNG.hashString(String(s)) : 0) >>> 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  var DAY = 86400;
  var DIAL = 10;
  var SAID_MAX = 64;
  var LOG_MAX = 8;
  var TALK_RANGE = 3.2;            // m: walk further than this and the conversation ends
  var ROUND_BASE = 30;             // cr, a round at the bar

  /* ---- who they are --------------------------------------------------------
   * The class a person's temper and values are drawn as — captains.js's own
   * classes, so the weights are the ones a ship's chair uses. */
  function classOf(person) {
    if (!person) return 'trade';
    if (person.route || person.shipName) {
      return person.liv === 'navy' ? 'navy' : (person.liv === 'syn' || person.liv === 'pir') ? 'pirate' : 'trade';
    }
    var r = person.role;
    if (r === 'marine' || r === 'officer') return 'navy';
    if (r === 'security' || r === 'tactical') return 'police';
    if (r === 'enforcer' || r === 'heavy' || r === 'fixer' || r === 'raider') return 'pirate';
    return 'trade';
  }

  /* What sort of person this is to talk to: the topics they have. */
  function kindOf(person) {
    if (!person) return 'other';
    if (person.crew) return 'yours';
    if (person.forHire) return 'hire';
    if (person.route || person.shipName) return 'shipcrew';
    if (person.staff === 'Bartender' || person.role === 'bartender') return 'bartender';
    if (person.staff === 'Market clerk') return 'market';
    if (person.staff === 'Yard clerk') return 'yard';
    if (person.staff === 'Hall steward' || person.role === 'steward') return 'steward';
    if (person.role === 'officer') return 'customs';
    if (person.role === 'marine') return 'marine';
    if (person.role === 'security' || person.role === 'tactical') return 'security';
    if (person.role === 'fixer') return 'fixer';
    if (person.role === 'factor') return 'factor';
    if (person.role === 'enforcer' || person.role === 'heavy') return 'syndicate';
    return 'other';
  }

  var JOB = {
    yours: null, hire: 'looking for a berth', bartender: 'I keep the bar', market: 'I keep the market desk',
    yard: 'I run the yard desk', steward: 'I keep the crew hall', customs: 'customs officer',
    marine: 'marine on the lock', security: 'port security', fixer: null, syndicate: 'I work for the Syndicate',
    factor: 'I keep the desk for a trading house',
    other: null
  };

  function persona(G, sys, port, person) {
    var C = Cap();
    var cls = classOf(person), kind = kindOf(person);
    var rng = new RNG('person|' + (G && G.seed) + '|' + person.id);
    var weighted = C && C.weighted;
    var temper = weighted ? weighted(rng, C.TEMPER_WEIGHTS[cls]) : 'friendly';
    var values = weighted ? weighted(rng, C.VALUE_WEIGHTS[cls]) : 'profit';
    /* A Syndicate face is not a cutter captain: whatever the draw, a fixer
     * deals, and an abolitionist in a Syndicate jacket is someone the
     * Syndicate would not have hired. */
    if (cls === 'pirate' && values === 'abolitionist') values = 'profit';
    var faction = null;
    if (kind === 'shipcrew' && person.route) faction = person.route.flag || person.route.faction || null;
    else if (cls === 'pirate') faction = 'outlaw';
    else if (kind !== 'hire' && kind !== 'yours') faction = (port && port.faction) || null;
    return {
      key: 'person|' + person.id, id: person.id, name: person.name, given: String(person.name || '').split(' ')[0],
      kind: kind, cls: cls, role: person.role, temper: temper, values: values, faction: faction
    };
  }

  /* ---- memory -------------------------------------------------------------- */
  function memory(G, id, create) {
    G.people = G.people || {};
    var m = G.people[id];
    if (!m && create) {
      m = G.people[id] = { feeling: 0, honesty: 0, seen: 0, log: [], said: [], met: null, done: {} };
    }
    return m || null;
  }

  /* What each act between you does, by the same ladder captains.js keeps.
   * `seen` counts acts that moved how they feel: someone you have bought a
   * round for, or lied to, now goes by that, not by what they have heard. */
  var EVENTS = {
    lied:      { feeling: -2, honesty: -3 },
    exploited: { feeling: -4, honesty: -5 },
    honest:    { honesty: 1 },
    bought:    { feeling: 1 },
    praised:   { feeling: 1 },
    haggled:   { feeling: 0 },
    pushed:    { feeling: -1 },
    hired:     { feeling: 2 },
    paidFine:  { feeling: 1, honesty: 1 },
    stalled:   { feeling: -1 },
    bribed:    { feeling: 1 },
    tithed:    { feeling: 1 },
    told:      {}
  };
  var LOG_RANK = { exploited: 9, lied: 8, hired: 6, paidFine: 5, bribed: 5, tithed: 4, bought: 4, praised: 3,
                   pushed: 3, stalled: 3, haggled: 2, honest: 2, told: 1 };

  function record(G, id, kind, t, opts) {
    var ev = EVENTS[kind];
    if (!ev) return null;
    var m = memory(G, id, true);
    if (m.met == null) m.met = t;
    if (ev.feeling) { m.seen = (m.seen || 0) + 1; m.feeling = clamp((m.feeling || 0) + ev.feeling, -DIAL, DIAL); }
    if (ev.honesty) m.honesty = clamp((m.honesty || 0) + ev.honesty, -DIAL, DIAL);
    if (LOG_RANK[kind]) {
      m.log = m.log || [];
      var e = { k: kind, t: t };
      if (opts && opts.q) e.q = String(opts.q).slice(0, 48);
      m.log.push(e);
      while (m.log.length > LOG_MAX) {
        var worst = 0;
        for (var i = 1; i < m.log.length; i++) {
          var a = m.log[i], b = m.log[worst];
          if ((LOG_RANK[a.k] || 0) < (LOG_RANK[b.k] || 0) ||
              ((LOG_RANK[a.k] || 0) === (LOG_RANK[b.k] || 0) && a.t < b.t)) worst = i;
        }
        m.log.splice(worst, 1);
      }
    }
    return m;
  }

  function salient(m) {
    var best = null, log = (m && m.log) || [];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (!best || (LOG_RANK[e.k] || 0) > (LOG_RANK[best.k] || 0) ||
          ((LOG_RANK[e.k] || 0) === (LOG_RANK[best.k] || 0) && e.t > best.t)) best = e;
    }
    return best;
  }

  /* ---- what they think of you ----------------------------------------------- */
  function idKeyOf(G) {
    var C = Cap();
    return C && C.identity ? C.identity(G).key : 'self';
  }

  /* What they have to go on when they have not seen you act. */
  function heardOf(G, sys, port, person, p) {
    var C = Cap(), R = global.Rumours, idk = idKeyOf(G);
    /* Your own crew were there. */
    if (p.kind === 'yours') return { rec: (C && C.recordOf) ? C.recordOf(G, idk) : {}, top: {} };
    if (R && R.tallyAt && G.rumours && port && sys) {
      var tl = R.tallyAt(G, sys, 'P:' + port.id, G.t || 0, idk);
      var leg = G.recordLegacy && G.recordLegacy[idk];
      if (leg) for (var f in leg) tl.counts[f] = (tl.counts[f] || 0) + (leg[f] || 0);
      return { rec: tl.counts, top: tl.top };
    }
    return { rec: (C && C.recordOf) ? C.recordOf(G, idk) : {}, top: {} };
  }

  function contactOf(person) {
    return person && person.route ? { route: person.route, id: person.route.id, name: person.route.name,
                                      kind: person.route.kind || 'trade' } : null;
  }

  function opinion(G, sys, port, person) {
    var C = Cap();
    var p = persona(G, sys, port, person);
    var m = memory(G, p.key, false);
    var out = { persona: p, memory: m, score: 0, reason: null, band: 'neutral', captain: null };
    if (!C || !C.judge) return out;

    /* A DOCKED CREW SPEAK FOR THEIR CAPTAIN — until you have done something
     * to them yourself. */
    var contact = p.kind === 'shipcrew' ? contactOf(person) : null;
    if (contact && C.hasCaptain(contact) && !(m && m.seen > 0)) {
      var cop = C.opinion(G, sys, contact);
      if (cop) {
        out.captain = cop;
        out.score = cop.score; out.reason = cop.reason; out.band = cop.band;
        return out;
      }
    }
    var h = heardOf(G, sys, port, person, p);
    var j = C.judge(G, p, m, h.rec, h.top);
    var score = j.score;
    /* Your own hands also go by whether they are being paid. */
    if (p.kind === 'yours') {
      var owed = owedDays(G);
      if (owed >= 2) { score -= Math.min(4, owed); j.reasons.push({ kind: 'unpaid', w: Math.min(4, owed) + 1, v: -owed }); }
    }
    j.reasons.sort(function (a, b) { return b.w - a.w; });
    out.score = score;
    out.reason = j.reasons[0] || null;
    out.band = C.bandOf(score, null);
    return out;
  }

  function owedDays(G) {
    var s = (G && G.ship) || {};
    if (s.wagesTo == null) return 0;
    return Math.floor(((G.t || 0) - s.wagesTo) / DAY);
  }

  /* ---- lines, never twice ---------------------------------------------------
   * Every pool is walked in a seeded order that belongs to this person, and
   * the first line they have not already said to you is the one. When a
   * pool is spent they start again from the top rather than fall silent. */
  /* The pick is remembered as said the moment it is picked (by its
   * template, before {you} is filled in), so the next walk past the same
   * pool takes the next line. */
  function fresh(m, pool, seed) {
    if (!pool || !pool.length) return null;
    var said = (m && m.said) || [];
    var start = hash(seed) % pool.length, pick = null;
    for (var i = 0; i < pool.length && !pick; i++) {
      var line = pool[(start + i) % pool.length];
      if (said.indexOf(hash(line)) < 0) pick = line;
    }
    if (!pick) {
      /* Spent: start again, forgetting this pool's lines but nobody else's. */
      if (m && m.said) {
        var hs = pool.map(hash);
        m.said = m.said.filter(function (h) { return hs.indexOf(h) < 0; });
      }
      pick = pool[start];
    }
    noteSaid(m, pick);
    return pick;
  }
  function noteSaid(m, text) {
    if (!m || !text) return;
    m.said = m.said || [];
    var h = hash(text);
    if (m.said.indexOf(h) < 0) m.said.push(h);
    while (m.said.length > SAID_MAX) m.said.shift();
  }

  /* Addressing you: your ship's name off your own deck, "Captain" from your
   * crew, "pilot" from a stranger. */
  function you(G, p) {
    if (p.kind === 'yours') return 'Captain';
    var C = Cap(), a = C && C.addressOf ? C.addressOf(G) : null;
    return p.temper === 'gruff' ? 'pilot' : (a && a !== 'stranger' ? 'Captain' : 'pilot');
  }
  function fill(line, G, p, extra) {
    var out = line.replace(/\{you\}/g, you(G, p)).replace(/\{me\}/g, p.given || p.name);
    for (var k in (extra || {})) out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), extra[k]);
    return out;
  }

  /* In person, not on the radio. By band, with a temper's own voice. */
  var OPEN = {
    furious: { any: ['You. Walk away while you still can.', 'Not one word. Keep moving.',
                     'I know who you are. Get out of my sight.'],
               gruff: ['No.'], principled: ['I will not talk to you. Go.'] },
    angry:   { any: ['What do you want.', 'Make it quick.', 'You have a nerve, coming over here.',
                     'Say it and go.'],
               mercenary: ['Your money spends. Your company does not. What.'],
               friendly: ['I give everybody a fair hearing. You have used yours up. What is it?'] },
    cold:    { any: ['Yes?', 'What is it, {you}?', 'Go on.', 'I am busy. What do you need?'],
               wary: ['Stay where you are. What do you want?'], gruff: ['Yeah?'] },
    neutral: { any: ['Hello, {you}. What can I do for you?', 'Something you need?',
                     'Yes, {you}?', 'What can I do for you?'],
               friendly: ['Hello there! Not many people stop to talk. What is on your mind?'],
               wary: ['Can I help you?'], mercenary: ['If there is something in it for me, I am listening.'],
               gruff: ['What.'] },
    warm:    { any: ['Good to see you, {you}. What do you need?', 'Ah, {you}. Pull up a minute.',
                     'Hello again, {you}.', '{you}! What can I do for you?'],
               gruff: ['You are all right. What is it?'] },
    glad:    { any: ['{you}! Now there is a face I like to see.', 'Anything you need, {you}, just ask.',
                     'Always a pleasure, {you}.', 'Well, look who it is.'],
               principled: ['People like you are why this place still works. What do you need?'] }
  };
  OPEN.grateful = OPEN.glad;

  /* What they remember, said to your face. */
  var RECALL = {
    exploited: ['You looked me in the eye and lied about people in need.', 'You used the word "{q}" to my face. It was a lie.',
                'I remember what you told me last time, and who you pretended to be carrying.'],
    lied:      ['Last time, you lied to me about your hold.', 'You told me "{q}". Your manifest said otherwise.',
                'I have not forgotten the last thing you told me, or that it was not true.'],
    hired:     ['Signing on with you was the right call.', 'Still glad I took your berth.'],
    paidFine:  ['You settled up last time. That counts with me.', 'You paid what you owed, no argument. I remember.'],
    bribed:    ['The friends you bought here are still friends.', 'Your money made you popular. Do not waste it.'],
    tithed:    ['You paid the overboss through me. He knows your name now.', 'Your tithe went where it should. Nobody here forgets that.'],
    bought:    ['Thanks again for that round.', 'The last round was on you. I remember.',
                'You bought the bar a drink last time. People noticed.'],
    praised:   ['I have not forgotten what you said about my work.', 'Kind words go a long way out here.'],
    pushed:    ['You tried to talk my price down last time.', 'Still think I am worth less than I ask?'],
    stalled:   ['You walked away from what you owed last time.', 'Still running from that warrant?'],
    haggled:   ['We struck a fair deal last time.'],
    honest:    ['You were straight with me last time.', 'You told me the truth before. I remember that.'],
    told:      ['You told me "{q}" last time.']
  };

  /* Why, in person. The captains' reasons, reworded for a deck. */
  var WHY = {
    tag: {},
    piracy: 'Half the bar knows what you do out there.',
    tender: 'You fired on a rescue tender. Nobody here forgets that.',
    wanted: 'There is a warrant on you, and everybody here can read the board.',
    rescues: 'They say you stop for ships in trouble.',
    pirate_hunter: 'They say you hunt raiders.',
    standing_good: 'Our people speak well of you.',
    standing_bad: 'Our people do not trust you.',
    piracy_admired: 'Word is you know how to take a prize.',
    wanted_admired: 'A warrant is a reference, where I come from.',
    syndicate: 'The Syndicate knows your name.',
    lies: 'They say your word is no good.',
    heard_bad: 'People I trust have told me about you.',
    heard_good: 'People I trust speak well of you.',
    unpaid: 'And we have not been paid.'
  };

  function reasonLine(G, sys, op) {
    var r = op.reason;
    if (!r || op.band === 'neutral') return null;
    if (r.rumour && global.Rumours && global.Rumours.lineFor) {
      var rl = global.Rumours.lineFor(G, sys, r.rumour, op.persona.key);
      if (rl) return rl;
    }
    if (r.kind === 'tag') {
      var C = Cap();
      return (C && C.REASONS && C.REASONS.tag[r.tag]) || null;
    }
    return WHY[r.kind] || null;
  }

  function greeting(G, sys, op, t) {
    var p = op.persona, m = op.memory, band = op.band;
    var e = salient(m);
    if (e && RECALL[e.k] && band !== 'furious') {
      var pool = RECALL[e.k].filter(function (l) { return !/\{q\}/.test(l) || e.q; });
      var rec = fresh(m, pool.map(function (l) { return l.replace(/\{q\}/g, e.q || ''); }), p.key + '|recall|' + e.k + '|' + e.t);
      if (rec) {
        var lead = fresh(m, (OPEN[band] || OPEN.neutral).any, p.key + '|lead|' + Math.floor(t / DAY));
        return fill(lead, G, p) + ' ' + rec;
      }
    }
    var set = OPEN[band] || OPEN.neutral;
    var pool2 = (set[p.temper] || []).concat(set.any);
    var line = fill(fresh(m, pool2, p.key + '|open|' + band + '|' + Math.floor(t / DAY)), G, p);
    var why = reasonLine(G, sys, op);
    /* A crew speaking for their skipper says so. */
    if (why && op.captain) why = 'The skipper says: "' + why + '"';
    return why ? line + ' ' + why : line;
  }

  /* ---- topics ---------------------------------------------------------------
   * Each is { id, label, when(ctx) -> bool | 'reason', run(ctx) -> line }.
   * `when` returning a string shows the topic greyed with that reason
   * (refusals carry reasons). A topic asked once in a conversation is not
   * offered again in it; the next conversation, it is, and the answer is
   * worded differently. */
  function sayLine(ctx, pool, tag) {
    return fill(fresh(ctx.m, pool, ctx.p.key + '|' + tag + '|' + Math.floor(ctx.t / DAY)) || pool[0], ctx.G, ctx.p);
  }
  function refusing(ctx) { return ctx.op.band === 'furious' || ctx.op.band === 'angry'; }
  function refusal(ctx, tag) {
    return sayLine(ctx, ctx.op.band === 'furious'
      ? ['I said walk away.', 'No.', 'We are done.']
      : ['Not to you.', 'Ask someone who likes you.', 'Find somebody else.', 'I do not have to answer that.'], 'no|' + tag);
  }
  function credits(G) { return Math.round((G.ship && G.ship.credits) || 0); }
  function portName(ctx) { return (ctx.port && ctx.port.name) || 'this port'; }

  /* Who are you? */
  var WHO = {
    id: 'who', label: 'Who are you?',
    run: function (ctx) {
      var p = ctx.p, P = ctx.person, C = Cap();
      if (p.kind === 'yours') {
        var CrewM = global.Crew, cw = P.crew || {};
        var kn = CrewM && CrewM.knackOf ? CrewM.knackOf(cw) : null;
        return 'You know me, Captain. ' + P.name + ', your ' + p.role +
               (CrewM && CrewM.ratingWord ? ', ' + CrewM.ratingWord(cw.rating) : '') +
               (kn ? ' — ' + CrewM.KNACKS[kn].name.toLowerCase() : '') + '.';
      }
      if (refusing(ctx)) return refusal(ctx, 'who');
      var job = JOB[p.kind];
      if (p.kind === 'shipcrew') {
        var cap = ctx.op.captain && ctx.op.captain.profile;
        job = p.role + ' on the ' + (P.shipName || 'ship') + (cap ? ', under Captain ' + cap.family : '');
      } else if (p.kind === 'fixer') {
        job = p.temper === 'gruff' ? 'nobody you need to know' : 'someone who knows people';
      } else if (p.kind === 'factor') {
        var fw = firmOf(ctx);
        if (fw) job = 'factor for ' + fw.name + ' — ' + global.TradingFirm.ratingWord(fw.rating);
      } else if (p.kind === 'hire') {
        var CR = global.Crew;
        job = (CR && CR.ratingWord ? CR.ratingWord(P.forHire.rating) + ' ' : '') + P.forHire.role + ', looking for a berth';
      }
      var flavour = {
        wary: ['I keep my head down.', 'I do not get into other people\'s business.'],
        friendly: ['Pleased to meet you.', 'Good to meet you properly.'],
        mercenary: ['If you need something done, I can be paid.', 'Everything has a price here, including me.'],
        principled: ['I do things by the book.', 'I do my job right or not at all.'],
        gruff: ['That is all you need.', 'That is it.']
      }[p.temper] || [''];
      return P.name + '. ' + job.charAt(0).toUpperCase() + job.slice(1) + '. ' + sayLine(ctx, flavour, 'who|' + p.temper);
    }
  };

  /* What have you heard about me? — the rumour network, said to your face. */
  var HEARD = {
    id: 'heard', label: 'What have you heard about me?',
    run: function (ctx) {
      var G = ctx.G, op = ctx.op, p = ctx.p;
      if (op.band === 'furious') return refusal(ctx, 'heard');
      if (p.kind === 'yours') {
        var C = Cap(), rec = C && C.recordOf ? C.recordOf(G) : {};
        var bits = [];
        if (rec.rescues) bits.push(rec.rescues + ' ship' + (rec.rescues > 1 ? 's' : '') + ' pulled out of the dark');
        if (rec.pirateKills) bits.push(rec.pirateKills + ' raider' + (rec.pirateKills > 1 ? 's' : '') + ' put down');
        if (rec.piracy) bits.push(rec.piracy + ' hold' + (rec.piracy > 1 ? 's' : '') + ' taken at gunpoint');
        if (rec.lies) bits.push('a reputation for saying things on the band that are not true');
        if (!bits.length) return sayLine(ctx, ['Nothing yet, Captain. We are nobody, as far as the lanes are concerned.',
                                               'Nobody is talking about us. That is not the worst thing.'], 'heardYours');
        return 'What the crew hall knows about us: ' + bits.join(', ') + '. ' +
               (ctx.op.band === 'cold' || ctx.op.band === 'angry' ? 'Not all of it sits right with me.' : 'I can live with that.');
      }
      if (op.captain) {
        var why = reasonLine(G, ctx.sys, op);
        var cap = op.captain.profile;
        var feel = { furious: 'would rather see you burn', angry: 'cannot stand you', cold: 'does not trust you',
                     neutral: 'has no opinion of you', warm: 'thinks you are all right', glad: 'thinks well of you',
                     grateful: 'owes you, and knows it' }[op.band];
        return 'Captain ' + cap.family + ' ' + feel + '.' + (why ? ' She says: "' + why + '"' : '');
      }
      var top = null, h = heardOf(G, ctx.sys, ctx.port, ctx.person, p);
      for (var f in h.top) if (!top || h.top[f].w > top.w) top = h.top[f];
      if (top && global.Rumours) {
        var line = global.Rumours.lineFor(G, ctx.sys, top, p.key);
        if (line) return line + ' ' + sayLine(ctx, {
          furious: ['That is all I need to know.'], angry: ['Everyone has heard it.', 'Nobody here likes it.'],
          cold: ['I am keeping an eye on you.'], neutral: ['I make up my own mind.', 'That is just what people say.'],
          warm: ['Sounded good to me.'], glad: ['Most of us were glad to hear it.'], grateful: ['We were glad to hear it.']
        }[op.band] || ['That is what they say.'], 'heardTail');
      }
      var why2 = reasonLine(G, ctx.sys, op);
      if (why2) return why2;
      return sayLine(ctx, ['Nothing. Nobody here has said your name.', 'Not a thing. You are just another pilot to us.',
                           'Should I have heard something?'], 'heardNone');
    }
  };

  var LEAVE = {
    id: 'leave', label: 'Goodbye.', end: true,
    run: function (ctx) {
      return sayLine(ctx, {
        furious: ['Good.', 'Do not come back.'], angry: ['Finally.', 'Go on, then.'],
        cold: ['Right.', 'Mm.'], neutral: ['Safe flying.', 'Take care.', 'See you around.'],
        warm: ['Take care of yourself, {you}.', 'Come back any time.'],
        glad: ['Fair winds, {you}.', 'Do not be a stranger.'], grateful: ['Anything you need. Any time.']
      }[ctx.op.band] || ['Bye.'], 'bye');
    }
  };

  /* ---- the bar ---- */
  function roundCost(ctx) {
    var dev = (ctx.port && ctx.port.market && typeof ctx.port.market.dev === 'number') ? ctx.port.market.dev : 0.3;
    return Math.round(ROUND_BASE * (0.7 + dev * 1.5));
  }
  var ROUND = {
    id: 'round', label: function (ctx) { return 'Buy a round for the bar (' + roundCost(ctx) + ' cr)'; },
    when: function (ctx) {
      if (ctx.op.band === 'furious') return 'they will not take your money';
      var day = Math.floor(ctx.t / DAY);
      if (ctx.m && ctx.m.done && ctx.m.done.round === day) return 'you have already stood a round today';
      if (credits(ctx.G) < roundCost(ctx)) return 'you have ' + credits(ctx.G) + ' cr';
      return true;
    },
    run: function (ctx) {
      var cost = roundCost(ctx);
      ctx.G.ship.credits -= cost;
      var m = record(ctx.G, ctx.p.key, 'bought', ctx.t);
      m.done = m.done || {}; m.done.round = Math.floor(ctx.t / DAY);
      ctx.state.loose = true;
      return sayLine(ctx, ['That will make you popular. Cheers, {you}.', 'Generous. The room will remember it.',
                           'This round is on the captain, everyone! Now — what did you want to know?', 'Drinks up. People talk more with a glass in hand.'], 'round');
    }
  };

  function bound(ctx, route) {
    var sys = ctx.sys, here = ctx.port && ctx.port.id;
    var nextId = route.from === here ? route.to : route.from;
    var next = sys && sys.byId ? sys.byId[nextId] : null;
    var man = nextId === route.to ? route.out : route.back;
    return { to: next, manifest: man || [] };
  }

  var TALK = {
    id: 'talk', label: 'What is the talk around here?',
    when: function (ctx) {
      if (refusing(ctx)) return true;
      return (ctx.state.loose || ctx.op.band === 'warm' || ctx.op.band === 'glad' || ctx.op.band === 'grateful' ||
              ctx.p.temper === 'friendly') ? true : 'a round would loosen tongues';
    },
    run: function (ctx) {
      if (refusing(ctx)) return refusal(ctx, 'talk');
      var G = ctx.G, sys = ctx.sys, C = Cap(), items = [];
      /* Who in port cannot stand whom: friends and rivals off captains.js. */
      var Sim = global.Sim;
      var occ = (Sim && Sim.berthOccupants && ctx.port) ? Sim.berthOccupants(ctx.port, sys, ctx.t) : [];
      occ.forEach(function (o) {
        if (!o.route || !C) return;
        var pr = C.profile(G, sys, { route: o.route, id: o.route.id, name: o.route.name, kind: o.route.kind || 'trade' });
        if (!pr) return;
        var riv = pr.rival && global.Favours && global.Favours.profileByKey ? global.Favours.profileByKey(G, sys, pr.rival) : null;
        if (riv) items.push('Captain ' + pr.family + ' of the ' + o.name + ' will not drink in the same room as ' +
                            riv.title + ' ' + riv.family + '. Old business.');
        if (pr.values === 'abolitionist') items.push('The ' + o.name + '\'s captain has no time for slavers. Ask anyone.');
        if (pr.temper === 'mercenary') items.push('Captain ' + pr.family + ' of the ' + o.name + ' will carry anything for the right price.');
      });
      /* Raiders on the lanes, read off the patrols the radar draws. */
      var pir = ((sys && sys.patrols) || []).filter(function (s) { return s.kind === 'pirate'; }).length;
      if (pir) items.push(pir === 1 ? 'There is a raider working the lanes. Keep your eyes open.'
                                    : pir + ' raiders on the lanes, they say. Fly in company if you can.');
      var Combat = global.Combat;
      if (Combat && Combat.systemCorruption) {
        var corr = Combat.systemCorruption(G, sys), lab = Combat.corruptionLabel(corr);
        items.push(lab === 'clean' ? 'The law here cannot be bought. Do not try.'
                 : lab === 'bribeable' ? 'Half the officials here have a price, if you know who to ask.'
                 : 'Everybody here is bought. The only question is by whom.');
      }
      if (!items.length) items.push('Quiet. Ships in, ships out.');
      return fill(fresh(ctx.m, items, ctx.p.key + '|talk|' + Math.floor(ctx.t / DAY)), G, ctx.p);
    }
  };

  var INPORT = {
    id: 'inport', label: 'Who is in port?',
    run: function (ctx) {
      if (refusing(ctx)) return refusal(ctx, 'inport');
      var G = ctx.G, sys = ctx.sys, C = Cap(), Sim = global.Sim;
      var occ = (Sim && Sim.berthOccupants && ctx.port) ? Sim.berthOccupants(ctx.port, sys, ctx.t) : [];
      if (!occ.length) return 'Nobody but you. Quiet week.';
      var bits = occ.slice(0, 3).map(function (o) {
        var d = C && C.describe ? C.describe(G, sys, { route: o.route, id: o.route.id, name: o.route.name, kind: o.route.kind || 'trade' }) : null;
        return 'the ' + o.name + (d ? ' — ' + d : '');
      });
      return 'In port: ' + bits.join('; ') + (occ.length > 3 ? '; and ' + (occ.length - 3) + ' more.' : '.');
    }
  };

  /* ---- the market desk ---- */
  function marks(ctx) {
    var Eco = global.Economy, port = ctx.port;
    if (!Eco || !port || !port.market || !Eco.priceList) return [];
    return Eco.priceList(port, ctx.t).map(function (row) {
      var mk = Eco.priceMark(row), c = Eco.BY_ID[row.id];
      return { row: row, mark: mk, name: c ? c.name.toLowerCase() : row.id, contraband: !!(c && c.contraband) };
    }).filter(function (x) { return !x.contraband; });
  }
  var CHEAP = {
    id: 'cheap', label: 'What is cheap here?',
    run: function (ctx) {
      if (ctx.op.band === 'furious') return refusal(ctx, 'cheap');
      var list = marks(ctx).filter(function (x) { return x.mark.buy > 0; })
        .sort(function (a, b) { return b.mark.buy - a.mark.buy; }).slice(0, 2);
      if (!list.length) return sayLine(ctx, ['Nothing is going cheap this week.', 'Prices are fair across the board. Nothing to steal.'], 'cheapNone');
      return (ctx.op.band === 'angry' ? 'It is on the board, same as for anyone. ' : '') +
             'Best buys at ' + portName(ctx) + ': ' + list.map(function (x) {
               return x.name + ' at ' + Math.round(x.row.buy) + ' cr'; }).join(', and ') + '.';
    }
  };
  var DEAR = {
    id: 'dear', label: 'What sells well here?',
    run: function (ctx) {
      if (ctx.op.band === 'furious') return refusal(ctx, 'dear');
      var list = marks(ctx).filter(function (x) { return x.mark.sell > 0; })
        .sort(function (a, b) { return b.mark.sell - a.mark.sell; }).slice(0, 2);
      if (!list.length) return sayLine(ctx, ['Nobody is paying over the odds for anything right now.'], 'dearNone');
      var hold = (ctx.G.ship && ctx.G.ship.cargo) || {};
      var have = list.filter(function (x) { return (hold[x.row.id] || 0) > 0; });
      return 'We pay well for ' + list.map(function (x) { return x.name + ' (' + Math.round(x.row.sell) + ' cr)'; }).join(' and ') + '.' +
             (have.length ? ' And you have ' + have[0].name + ' aboard, I see.' : '');
    }
  };
  var SPECIAL = {
    id: 'special', label: 'Any buyers for… special cargo?',
    run: function (ctx) {
      var p = ctx.p;
      if (refusing(ctx)) return refusal(ctx, 'special');
      if (p.values === 'lawful') {
        record(ctx.G, p.key, 'told', ctx.t, { q: 'special cargo' });
        return sayLine(ctx, ['I did not hear that, and you did not say it.', 'Not at this desk. Not in this port, if I have anything to do with it.'], 'specialLaw');
      }
      if (p.values === 'abolitionist') return sayLine(ctx, ['If you mean people, get away from my desk.', 'Depends what you mean. If it breathes, the answer is no.'], 'specialAbo');
      return sayLine(ctx, ['Not at my counter. Try the bar. Somebody there always knows somebody.',
                           'There is always someone in the bar who does not ask questions.'], 'specialBar');
    }
  };


  /* ---- the trading house (tradingfirm.js, 2026-11-03) ----
   * Astra: "another NPC type, they're kinda like the fixer, but civilian,
   * and their job is a combination of economist and import/export
   * company". Two services: a paid market READING, and an ACCOUNT — your
   * ships, a budget and a goods list, traded on the firm's book and
   * reviewed every quarter. Everything here is a call into TradingFirm,
   * which owns the money and the refusals; the talk is only the desk. */
  function TFm() { return global.TradingFirm; }
  function firmOf(ctx) {
    var T = TFm();
    return T && ctx.port && ctx.sys ? T.firmAt(ctx.port, ctx.sys) : null;
  }
  function crs(n) { return Math.round(n).toLocaleString('en-US') + ' cr'; }
  var BUDGETS = [5000, 10000, 20000, 50000, 100000, 250000, 500000, 1000000];
  function dealOf(ctx) {
    var st = ctx.state, f = firmOf(ctx);
    if (!st.deal) {
      var b = BUDGETS[0];
      for (var i = 0; i < BUDGETS.length; i++) if (BUDGETS[i] >= ((f && f.minAccount) || 0)) { b = BUDGETS[i]; break; }
      st.deal = { hulls: [], goods: [], budget: b };
    }
    return st.deal;
  }
  /* Your ships the desk could be asked about: every one of yours, those in
   * this system first. A ship it cannot take is still listed, greyed, with
   * why — a list that silently leaves your Kestrel out reads as a bug. */
  function shipsFor(ctx) {
    var F = global.Fleet, here = ctx.G.here && ctx.G.here.id;
    var l = F ? F.list(ctx.G).slice() : [];
    l.sort(function (a, b) {
      var ah = (a.star || here) === here ? 0 : 1, bh = (b.star || here) === here ? 0 : 1;
      return ah - bh || (a.id < b.id ? -1 : 1);
    });
    return l.slice(0, 6);
  }
  function pilotWord(rec) {
    var F = global.Fleet, CrewM = global.Crew, p = F && F.pilotOf ? F.pilotOf(rec) : null;
    return p ? p.name + (CrewM && CrewM.ratingWord ? ', ' + CrewM.ratingWord(p.rating) + ' pilot' : '') : 'no pilot';
  }
  function goodsWords(list) {
    var T = TFm();
    return !list || !list.length ? 'the house\'s choice' : list.map(function (c) { return T.goodName(c); }).join(', ');
  }

  var FIRM_WHAT = {
    id: 'firmwhat', label: 'What does your house do?',
    run: function (ctx) {
      var f = firmOf(ctx);
      if (!f) return 'Nothing, these days.';
      return f.name + ' reads markets and moves cargo on its own book. Hand us a ship with a pilot aboard and a budget; ' +
             'we choose the buys and the sells, in this system and out of it, and your pilot flies them. We run ' +
             f.capacity + ' hull' + (f.capacity > 1 ? 's' : '') + ' at most and take ' + Math.round(f.commission * 100) +
             '% of what a quarter makes. ' + (f.minAccount ? 'Not worth our time under ' + f.minAccount.toLocaleString('en-US') + '. ' : '') +
             'We are measured by the quarter, like any trader: a quarter that loses money, and we are done.';
    }
  };
  var READING = {
    id: 'reading', label: function (ctx) { var f = firmOf(ctx); return 'A market reading (' + (f ? f.readingFee : 0) + ' cr)'; },
    when: function (ctx) {
      var f = firmOf(ctx);
      if (!f) return false;
      if (refusing(ctx)) return 'they will not take your money';
      if (credits(ctx.G) < f.readingFee) return 'you have ' + credits(ctx.G) + ' cr';
      return true;
    },
    run: function (ctx) {
      var f = firmOf(ctx), T = TFm();
      var r = T.reading(ctx.G, f, ctx.port, ctx.sys, ctx.t);
      ctx.G.ship.credits -= f.readingFee;
      record(ctx.G, ctx.p.key, 'bought', ctx.t);
      if (!r.rows.length) return 'For ' + r.whose + ': nothing we can read with any confidence. Keep your money next time.';
      return 'For ' + r.whose + ' — ' + r.rows.map(function (x) { return x.text; }).join('; ') + '.';
    }
  };
  var ENGAGE = {
    id: 'engage', label: 'I want you to trade my ships.',
    when: function (ctx) {
      var T = TFm(), f = firmOf(ctx);
      if (!f) return false;
      if (T.contractWith(ctx.G, f)) return false;
      if (refusing(ctx)) return 'not for you';
      return true;
    },
    run: function (ctx) {
      var f = firmOf(ctx);
      dealOf(ctx);
      ctx.state.node = 'firm';
      return 'Then let us draw it up. Which ships, how much, and what may we trade? ' +
             (f.minAccount ? 'Mind the floor: ' + f.minAccount.toLocaleString('en-US') + ' at least.' : 'Any budget you like.');
    }
  };
  function accountWords(ctx, c) {
    var T = TFm(), G = ctx.G, t = ctx.t;
    T.book(G, t);
    var hulls = T.hullsOf(G, c).map(function (r) { return r.name + ' ' + T.phaseOf(r, t); });
    var eq = T.equity(G, c);
    return 'Your account: ' + crs(c.cash) + ' in cash, ' + crs(eq) + ' all told; this quarter so far ' +
           ((eq - c.qStart - c.qFlows) >= 0 ? '+' : '') + crs(eq - c.qStart - c.qFlows) + '. ' +
           T.quarterLine(c, t) + '. ' + (hulls.length ? 'On the book: ' + hulls.join('; ') + '.' : 'No hulls on the book.') +
           (c.closing ? ' The account is closing.' : '');
  }
  var ACCOUNT = {
    id: 'account', label: 'How does my account stand?',
    when: function (ctx) {
      var T = TFm(), f = firmOf(ctx);
      return !!(f && T.contractWith(ctx.G, f));
    },
    run: function (ctx) {
      var c = TFm().contractWith(ctx.G, firmOf(ctx));
      ctx.state.node = 'account';
      return accountWords(ctx, c);
    }
  };

  /* The deal sheet: one row per term, a SIGN row that says what is wrong
   * until nothing is. */
  function firmSheet(ctx) {
    var T = TFm(), f = firmOf(ctx), d = dealOf(ctx), out = [];
    if (!f) return [];
    out.push({ id: 'f-budget', sub: 'firm', label: 'Budget: ' + crs(d.budget) + '  (more)',
      run: function (c2) {
        var dd = dealOf(c2), i = BUDGETS.indexOf(dd.budget), f2 = firmOf(c2);
        var next = BUDGETS[(i + 1) % BUDGETS.length];
        /* Round past anything under the house's floor or over your purse. */
        for (var k = 0; k < BUDGETS.length && (next < f2.minAccount || next > credits(c2.G)) && next !== BUDGETS[0]; k++) {
          next = BUDGETS[(BUDGETS.indexOf(next) + 1) % BUDGETS.length];
        }
        dd.budget = next;
        return crs(next) + '. ' + (next < f2.minAccount ? 'Under our floor of ' + f2.minAccount.toLocaleString('en-US') + ', mind.' : 'Fine.');
      } });
    shipsFor(ctx).forEach(function (rec) {
      var on = d.hulls.indexOf(rec.id) >= 0;
      var why = T.hullRefusal(ctx.G, rec, f, ctx.G.here && ctx.G.here.id);
      out.push({ id: 'f-hull-' + rec.id, sub: 'firm',
        label: (on ? '[x] ' : '[ ] ') + 'the ' + rec.name + ' (' + pilotWord(rec) + ')',
        when: function () { return why ? why : true; },
        run: function (c2) {
          var dd = dealOf(c2), ix = dd.hulls.indexOf(rec.id);
          if (ix >= 0) { dd.hulls.splice(ix, 1); return 'The ' + rec.name + ' stays yours to fly.'; }
          dd.hulls.push(rec.id);
          return 'The ' + rec.name + ', then. ' + pilotWord(rec) + ' at the helm.';
        } });
    });
    out.push({ id: 'f-goods', sub: 'firm', label: 'Goods: ' + goodsWords(d.goods) + '  (choose)',
      run: function (c2) { c2.state.node = 'firmgoods'; return 'Which goods may we touch? Leave it empty and we trade anything honest.'; } });
    var can = T.canEngage(ctx.G, f, ctx.port, ctx.sys, d);
    out.push({ id: 'f-sign', sub: 'firm',
      label: 'Sign: ' + d.hulls.length + ' hull' + (d.hulls.length === 1 ? '' : 's') + ', ' + crs(d.budget),
      when: function () { return can.ok ? true : can.why; },
      run: function (c2) {
        var r = T.engage(c2.G, f, c2.port, c2.sys, dealOf(c2), c2.t);
        c2.state.node = null; c2.state.deal = null;
        if (!r.ok) return 'We cannot: ' + r.why;
        record(c2.G, c2.p.key, 'bought', c2.t);
        c2.state.firmSigned = true;
        return 'Signed. ' + crs(r.contract.cash) + ' on the account, and we will have the first run out by the end of the watch. ' +
               'The quarter ends in ninety-one days; ask here, or look at FLEET.';
      } });
    out.push({ id: 'f-back', sub: 'firm', label: 'Not today.',
      run: function (c2) { c2.state.node = null; c2.state.deal = null; return 'The offer stands.'; } });
    return out;
  }
  function goodsSheet(ctx) {
    var T = TFm(), d = dealOf(ctx), out = [];
    var port = ctx.port, seen = {};
    var list = (port && port.market ? port.market.order : []).filter(function (c) { return T.legalGood(c); });
    d.goods.forEach(function (c) { if (list.indexOf(c) < 0) list.push(c); });
    list.forEach(function (cid) {
      if (seen[cid]) return; seen[cid] = true;
      var on = d.goods.indexOf(cid) >= 0;
      out.push({ id: 'g-' + cid, sub: 'firmgoods', label: (on ? '[x] ' : '[ ] ') + T.goodName(cid),
        run: function (c2) {
          var dd = dealOf(c2), ix = dd.goods.indexOf(cid);
          if (ix >= 0) dd.goods.splice(ix, 1); else dd.goods.push(cid);
          dd.goods.sort();
          return 'Goods: ' + goodsWords(dd.goods) + '.';
        } });
    });
    out.push({ id: 'g-any', sub: 'firmgoods', label: 'Anything honest — the house chooses',
      run: function (c2) { dealOf(c2).goods = []; return 'Anything honest, then.'; } });
    out.push({ id: 'g-done', sub: 'firmgoods', label: 'Done with the goods.',
      run: function (c2) { c2.state.node = 'firm'; return 'Goods: ' + goodsWords(dealOf(c2).goods) + '.'; } });
    return out;
  }
  function accountSheet(ctx) {
    var T = TFm(), f = firmOf(ctx), G = ctx.G, out = [];
    var c = f ? T.contractWith(G, f) : null;
    if (!c) return [{ id: 'a-none', sub: 'account', label: 'That is all.', run: function (c2) { c2.state.node = null; return 'Good day.'; } }];
    var prof = T.profitAvailable(c);
    var pw = prof > 0 ? T.canWithdraw(G, c, prof, ctx.port) : { ok: false, why: 'no profit above what you put in, yet' };
    out.push({ id: 'a-profit', sub: 'account', label: 'Withdraw the profit (' + crs(prof) + ')',
      when: function () { return pw.ok ? true : pw.why; },
      run: function (c2) {
        var r = T.withdraw(c2.G, c, prof, c2.t, c2.port);
        return r.ok ? crs(r.amount) + ', to your account. The budget stands as you gave it.' : 'We cannot: ' + r.why;
      } });
    var w10 = T.canWithdraw(G, c, 10000, ctx.port);
    out.push({ id: 'a-w10', sub: 'account', label: 'Withdraw 10,000 cr',
      when: function () { return w10.ok ? true : w10.why; },
      run: function (c2) { var r = T.withdraw(c2.G, c, 10000, c2.t, c2.port); return r.ok ? 'Ten thousand, to you.' : 'We cannot: ' + r.why; } });
    var d10 = T.canDeposit(G, c, 10000);
    out.push({ id: 'a-d10', sub: 'account', label: 'Deposit 10,000 cr',
      when: function () { return d10.ok ? true : d10.why; },
      run: function (c2) { var r = T.deposit(c2.G, c, 10000, c2.t); return r.ok ? 'Ten thousand more to work with. Thank you.' : 'We cannot: ' + r.why; } });
    shipsFor(ctx).filter(function (rec) { return !rec.trade; }).slice(0, 3).forEach(function (rec) {
      var ok = T.canAddHull(G, c, rec);
      out.push({ id: 'a-add-' + rec.id, sub: 'account', label: 'Hand them the ' + rec.name + ' as well',
        when: function () { return ok.ok ? true : ok.why; },
        run: function (c2) { var r = T.addHull(c2.G, c, rec, c2.t); return r.ok ? 'The ' + rec.name + ' is on our book.' : 'We cannot: ' + r.why; } });
    });
    out.push({ id: 'a-close', sub: 'account', label: 'Close the account',
      when: function () { return c.closing ? 'it is already closing' : true; },
      run: function (c2) {
        var r = T.close(c2.G, c, c2.t);
        c2.state.node = null;
        if (!r.ok) return 'We cannot: ' + r.why;
        c2.state.firmLines = r.lines;
        return c.closed ? 'Closed, and remitted. It was a pleasure.' :
               'As you like. The hulls on a run finish it; we remit the balance when the last is home.';
      } });
    out.push({ id: 'a-done', sub: 'account', label: 'That is all.',
      run: function (c2) { c2.state.node = null; return 'Good day, Captain.'; } });
    return out;
  }

  /* ---- the yard desk ---- */
  var HULL = {
    id: 'hull', label: 'How does my ship look?',
    run: function (ctx) {
      if (ctx.op.band === 'furious') return refusal(ctx, 'hull');
      var s = ctx.G.ship || {}, f = s.hullMax ? (s.hullHp || 0) / s.hullMax : 1;
      var C = global.Combat, name = C && C.HULLS && C.HULLS[s.hullId] ? C.HULLS[s.hullId].name : 'ship';
      return (f > 0.95 ? 'Your ' + name + ' is in good shape. Nothing for us to do.'
            : f > 0.6 ? 'Some scorching on the ' + name + '. ' + Math.round(f * 100) + '% hull. We can patch that.'
            : f > 0.25 ? 'She has taken a beating — ' + Math.round(f * 100) + '% hull. I would not fly her far like that.'
            : 'I am amazed she docked. ' + Math.round(f * 100) + '% hull. Do not undock until we have been at her.');
    }
  };
  var PAPERS = {
    id: 'papers', label: 'Can anyone here change a ship\'s papers?',
    run: function (ctx) {
      var C = Cap(), p = ctx.p;
      if (refusing(ctx)) return refusal(ctx, 'papers');
      var why = C && C.refitRefusal ? C.refitRefusal(ctx.G, ctx.sys, ctx.port, 'light') : 'no';
      var shady = !why || /cr\b|short/.test(why);
      if (p.values === 'lawful') {
        record(ctx.G, p.key, 'told', ctx.t, { q: 'new papers' });
        return shady ? 'Not legally. And I would not tell you if they could.' : 'Not at an honest yard. This is an honest yard.';
      }
      return shady ? sayLine(ctx, ['Ask at the yard, quietly. Bring cash.', 'There is a man in the back who does transponders. You did not hear it from me.'], 'papersYes')
                   : 'Nobody here will touch a transponder. Try somewhere the officials are bought.';
    }
  };

  /* ---- the crew hall ---- */
  var HANDS = {
    id: 'hands', label: 'Who is looking for a berth?',
    run: function (ctx) {
      var CrewM = global.Crew;
      if (!CrewM || !ctx.port) return 'Nobody today.';
      var signed = (CrewM.aboard ? CrewM.aboard(ctx.G.ship) : []).map(function (c) { return c.id; });
      var hall = CrewM.forHire(ctx.port, ctx.t).filter(function (c) { return signed.indexOf(c.id) < 0; });
      if (!hall.length) return 'Nobody today. Try again in a day or two.';
      return hall.slice(0, 4).map(function (c) {
        var kn = CrewM.knackOf ? CrewM.knackOf(c) : null;
        return c.name + ', ' + CrewM.ratingWord(c.rating) + ' ' + c.role + (kn ? ' (' + CrewM.KNACKS[kn].name.toLowerCase() + ')' : '');
      }).join('; ') + '. They are in the hall if you want to talk to them.';
    }
  };

  /* ---- a hand looking for a berth ---- */
  function fee(ctx) {
    var CrewM = global.Crew, P = ctx.person.forHire;
    var base = CrewM ? CrewM.signingFee(P) : 0;
    return Math.round(base * (P.feeMul || 1));
  }
  var TERMS = {
    id: 'terms', label: 'What are your terms?',
    run: function (ctx) {
      var CrewM = global.Crew, P = ctx.person.forHire;
      if (ctx.op.band === 'furious') return refusal(ctx, 'terms');
      return fee(ctx) + ' cr to sign, then ' + CrewM.dailyWage(P) + ' cr a day while I am aboard.' +
             (P.wageMul && P.wageMul < 1 ? ' As we agreed.' : '');
    }
  };
  var SKILLS = {
    id: 'skills', label: 'What can you do?',
    run: function (ctx) {
      var CrewM = global.Crew, P = ctx.person.forHire;
      var kn = CrewM.knackOf ? CrewM.knackOf(P) : null;
      var what = CrewM.ROLES[P.role] ? CrewM.ROLES[P.role].what : '';
      return 'I am ' + CrewM.ratingWord(P.rating) + ' at it. ' + (what ? what.charAt(0).toUpperCase() + what.slice(1) + '.' : '') +
             (kn ? ' ' + CrewM.KNACKS[kn].name + ': ' + CrewM.KNACKS[kn].what + '.' : '');
    }
  };
  /* Haggling: once a person. Who says yes is the comms rules again — how
   * they feel about you, and their temper. */
  var HAGGLE = {
    id: 'haggle', label: 'Would you take less?',
    when: function (ctx) {
      if (ctx.m && ctx.m.done && ctx.m.done.haggle) return 'you have already asked';
      return refusing(ctx) ? 'they will not bargain with you' : true;
    },
    run: function (ctx) {
      var P = ctx.person.forHire, p = ctx.p, band = ctx.op.band;
      var m = memory(ctx.G, p.key, true);
      m.done = m.done || {}; m.done.haggle = true;
      var yes = band === 'warm' || band === 'glad' || band === 'grateful' ||
                (band === 'neutral' && (p.temper === 'friendly' || p.temper === 'principled'));
      if (p.temper === 'mercenary' && band !== 'glad' && band !== 'grateful') yes = false;
      if (yes) {
        P.feeMul = 0.8; P.wageMul = 0.85;
        record(ctx.G, p.key, 'haggled', ctx.t);
        return sayLine(ctx, ['For you? All right. A fifth off the fee and a bit off the wage.',
                             'Fine. I would rather fly with someone decent for less.'], 'haggleYes');
      }
      record(ctx.G, p.key, 'pushed', ctx.t);
      return sayLine(ctx, p.temper === 'mercenary' ? ['My price is my price.', 'You get what you pay for, pilot.']
                                                   : ['No. That is what I am worth.', 'I would rather wait for a better offer.'], 'haggleNo');
    }
  };
  var SIGN = {
    id: 'sign', label: function (ctx) { return 'Sign on (' + fee(ctx) + ' cr)'; },
    when: function (ctx) {
      if (refusing(ctx)) return 'they will not fly with you';
      if (credits(ctx.G) < fee(ctx)) return 'you have ' + credits(ctx.G) + ' cr';
      return true;
    },
    run: function (ctx) {
      var CrewM = global.Crew, P = ctx.person.forHire, s = ctx.G.ship;
      var cost = fee(ctx);
      s.credits -= cost;
      (s.crew = CrewM.aboard(s).slice()).push(P);
      record(ctx.G, ctx.p.key, 'hired', ctx.t);
      ctx.state.hired = true;
      ctx.state.end = true;
      return sayLine(ctx, ['Done. I will get my kit and see you aboard.', 'You will not regret it, Captain.',
                           'Right. Where is she berthed?'], 'signed');
    }
  };

  /* ---- the law ---- */
  function scans(ctx) {
    /* Customs and marines always read your manifest; port security can pull
     * it from the dock if they care to — the lawful and the principled do. */
    var p = ctx.p;
    return p.kind === 'customs' || p.kind === 'marine' ||
           (p.kind === 'security' && (p.values === 'lawful' || p.temper === 'principled'));
  }
  /* Your answer to "what is your business here?", as the comms page's
   * claims, so Messages.check reads them against the real ship. */
  var CLAIMS = [
    { id: 'ordinary', label: '"Trade. Ordinary freight."', claims: { cargo: { value: 'ordinary', label: 'freight', neg: false } } },
    { id: 'medical', label: '"Relief work. Medical supplies."', claims: { cargo: { value: 'humanitarian', label: 'medical supplies', neg: false } } },
    { id: 'empty', label: '"Just passing through. Hold\'s empty."', claims: { cargo: { value: 'none', label: 'empty', neg: false } } },
    { id: 'mine', label: '"That is my business."', claims: null }
  ];
  function claimTopic(c) {
    return {
      id: 'claim-' + c.id, label: c.label, sub: 'business',
      run: function (ctx) {
        var G = ctx.G, sys = ctx.sys, p = ctx.p, M = global.Messages, Cm = Cap();
        ctx.state.node = null;
        if (!c.claims) {
          if (p.temper === 'gruff' || p.temper === 'wary' || p.values === 'lawful') {
            record(G, p.key, 'stalled', ctx.t);
            return sayLine(ctx, ['Then we will be watching you.', 'Suit yourself. Do not make it mine.'], 'mine');
          }
          return sayLine(ctx, ['Fair enough.', 'Fine. Keep it civil.'], 'mineOk');
        }
        var chk = M && M.check ? M.check(G, sys, ctx.t, c.claims, 'message') : { honest: true, lies: [] };
        if (!chk.honest && scans(ctx)) {
          var w = M.weighLie(chk.lies);
          record(G, p.key, w.event === 'exploited' ? 'exploited' : 'lied', ctx.t, { q: c.label.replace(/"/g, '') });
          if (Cm && Cm.bumpRecord) Cm.bumpRecord(G, 'lies', 1);
          return sayLine(ctx, ['Your manifest says otherwise. I will remember that.', 'That is not what the dock has on file for you.',
                               'We read your hold when you berthed. Try again — no, do not.'], 'caught');
        }
        if (chk.honest) {
          record(G, p.key, 'honest', ctx.t);
          return sayLine(ctx, ['Matches what we have. Go ahead.', 'All in order. Enjoy your stay.', 'Fine. Move along.'], 'honest');
        }
        /* An unread lie: they believe you, and you know it. */
        record(G, p.key, 'told', ctx.t, { q: c.label.replace(/"/g, '') });
        return sayLine(ctx, ['Right. Go ahead.', 'All right. Keep out of trouble.'], 'believed');
      }
    };
  }
  var BUSINESS = {
    id: 'business', label: 'I am just passing through.',
    open: 'business',
    run: function (ctx) {
      ctx.state.node = 'business';
      return sayLine(ctx, ['What is your business here?', 'Business at ' + portName(ctx) + '?', 'And what are you carrying?'], 'askBiz');
    }
  };
  function wantedFaction(ctx) {
    var Combat = global.Combat, f = ctx.p.faction;
    return (Combat && f && Combat.wantedHere && Combat.wantedHere(ctx.G, f)) ? f : null;
  }
  var WARRANT = {
    id: 'warrant', label: function (ctx) {
      var owed = ((ctx.G.wanted || {})[ctx.p.faction] || 0);
      return 'Settle my warrant (' + Math.round(owed * 1.6) + ' cr)';
    },
    when: function (ctx) {
      var owed = ((ctx.G.wanted || {})[ctx.p.faction] || 0);
      if (!owed) return false;
      if (credits(ctx.G) < Math.round(owed * 1.6)) return 'you have ' + credits(ctx.G) + ' cr';
      return true;
    },
    run: function (ctx) {
      var Combat = global.Combat, f = ctx.p.faction;
      var paid = Combat.payBounty(ctx.G, f);
      if (paid > 0) {
        record(ctx.G, ctx.p.key, 'paidFine', ctx.t);
        return 'Paid in full: ' + paid + ' cr. Your name is off the board here.';
      }
      return 'You are short. It is ' + (-paid) + ' cr.';
    }
  };
  var TROUBLE = {
    id: 'trouble', label: 'Any trouble lately?',
    run: function (ctx) {
      if (refusing(ctx)) return refusal(ctx, 'trouble');
      var sys = ctx.sys, Combat = global.Combat, bits = [];
      var pir = ((sys && sys.patrols) || []).filter(function (s) { return s.kind === 'pirate'; }).length;
      bits.push(pir ? (pir === 1 ? 'One raider on the lanes.' : pir + ' raiders working the lanes.') : 'The lanes are clear, for now.');
      if (Combat && Combat.violenceLabel && sys && sys.violence !== undefined) bits.push('This is a ' + Combat.violenceLabel(sys.violence) + ' system.');
      if (wantedFaction(ctx)) bits.push('And you are on our board. I would sort that out.');
      return bits.join(' ');
    }
  };

  /* ---- the Syndicate ---- */
  var FRIENDS = {
    id: 'friends', label: function (ctx) {
      var C = global.Combat;
      return 'I would like some friends in this port' + (C && C.bribeCost ? ' (' + C.bribeCost(ctx.G, ctx.sys, ctx.port) + ' cr)' : '') + '.';
    },
    when: function (ctx) {
      var C = global.Combat;
      if (!C || !C.bribePort || !ctx.port) return false;
      if (refusing(ctx)) return 'they do not deal with you';
      var corr = C.systemCorruption(ctx.G, ctx.sys);
      if (C.corruptionLabel(corr) === 'clean') return 'nobody here can be bought';
      var cost = C.bribeCost(ctx.G, ctx.sys, ctx.port);
      if (credits(ctx.G) < cost) return 'it costs ' + cost + ' cr — you have ' + credits(ctx.G);
      return true;
    },
    run: function (ctx) {
      var r = global.Combat.bribePort(ctx.G, ctx.sys, ctx.port);
      if (!r.ok) return r.maxed ? 'There is nobody left here worth buying. You own them already.' : 'Come back with ' + r.why.replace(/^short /, '') + ' more.';
      record(ctx.G, ctx.p.key, 'bribed', ctx.t);
      return 'Paid ' + r.paid + ' cr. The right people here now owe you a favour.';
    }
  };
  /* The overboss's tithe, paid across the bar (tithe.js). Astra: payable
   * "to a fixer in a Syndicate port's bar" as well as to the collector on
   * arrival — and it is the way back for someone who refused. */
  var TITHE = {
    id: 'tithe', label: function (ctx) {
      var T = global.Tithe;
      var late = T && T.status(ctx.G, ctx.sys, ctx.t) === 'suspected';
      return (late ? 'I would like to square things with the overboss' : 'I would like to pay the overboss\'s tithe') +
             (T ? ' (' + T.owed(ctx.G, ctx.sys, ctx.t) + ' cr).' : '.');
    },
    when: function (ctx) {
      var T = global.Tithe;
      if (!T || !T.held(ctx.sys)) return false;
      if (refusing(ctx)) return 'they do not deal with you';
      if (T.status(ctx.G, ctx.sys, ctx.t) === 'paid') return false;
      var cost = T.owed(ctx.G, ctx.sys, ctx.t);
      if (credits(ctx.G) < cost) return 'it is ' + cost + ' cr — you have ' + credits(ctx.G);
      return true;
    },
    run: function (ctx) {
      var r = global.Tithe.pay(ctx.G, ctx.sys, ctx.t, 'fixer');
      if (!r.ok) return 'Come back when you can. ' + r.why.charAt(0).toUpperCase() + r.why.slice(1) + '.';
      record(ctx.G, ctx.p.key, 'tithed', ctx.t);
      return r.say;
    }
  };

  var STANDING = {
    id: 'standing', label: 'How does the Syndicate see me?',
    run: function (ctx) {
      if (ctx.op.band === 'furious') return refusal(ctx, 'standing');
      var st = (ctx.G.standing && ctx.G.standing.outlaw) || 0;
      return st >= 50 ? 'You are one of ours, near enough. Doors open for you.'
           : st >= 15 ? 'People have noticed you. In a good way.'
           : st > -15 ? 'You are nobody to us. That can change.'
           : st > -50 ? 'You have made yourself unpopular. Be careful where you drink.'
           : 'If I were you, I would not be standing in this bar.';
    }
  };

  /* ---- a docked crew ---- */
  function captainOf(ctx) {
    var c = contactOf(ctx.person), C = Cap();
    return c && C && C.hasCaptain(c) ? { contact: c, profile: C.profile(ctx.G, ctx.sys, c) } : null;
  }
  var CAPTAIN = {
    id: 'captain', label: 'Who is your captain?',
    when: function (ctx) { return !ctx.person.master && !!captainOf(ctx); },
    run: function (ctx) {
      if (ctx.op.band === 'furious') return refusal(ctx, 'captain');
      var cp = captainOf(ctx).profile;
      var t = { wary: 'Careful sort. Checks everything twice.', friendly: 'Good to work for. Talks to everyone.',
                mercenary: 'Goes where the money is.', principled: 'Straight as a rule.', gruff: 'Not one for words.' }[cp.temper];
      var v = { abolitionist: 'Hates slavers more than anything.', profit: 'Cares about the margin.',
                lawful: 'Never broken a rule in her life.', pirate: 'Not too fussy about whose cargo it was.' }[cp.values];
      return cp.title + ' ' + cp.name + (cp.homeName ? ', out of ' + cp.homeName : '') + '. ' + t + ' ' + v;
    }
  };
  var OWES = {
    /* Asked of her master aboard her own ship (boarding, 2026-10-29) it is
     * "do YOU owe me", and she answers for herself. */
    id: 'owes', label: function (ctx) { return ctx.person.master ? 'Do you owe me anything?' : 'Does your captain owe me anything?'; },
    when: function (ctx) { return !!captainOf(ctx) && !!global.Favours; },
    run: function (ctx) {
      if (refusing(ctx)) return refusal(ctx, 'owes');
      var cap = captainOf(ctx), d = global.Favours.debtOf(ctx.G, ctx.sys, cap.contact);
      if (ctx.person.master) {
        if (d > 0) return 'I owe you ' + (d > 1 ? 'more than one' : 'one') + '. I have not forgotten.';
        if (d < 0) return 'Other way round. You owe me' + (d < -1 ? ', and not just the once' : '') + '.';
        return 'No. We are square.';
      }
      if (d > 0) return 'She says she owes you ' + (d > 1 ? 'more than one' : 'one') + '. Call her on the band — she will not forget.';
      if (d < 0) return 'Other way round, the way she tells it. You owe her' + (d < -1 ? ', and not just the once' : '') + '.';
      return 'Not that I know of. You are square.';
    }
  };
  var BOUND = {
    id: 'bound', label: 'Where are you bound?',
    when: function (ctx) { return !!ctx.person.route; },
    run: function (ctx) {
      var p = ctx.p, band = ctx.op.band, Eco = global.Economy;
      /* The comms rule for "what are you carrying": refused by the angry,
       * by the wary to anyone they do not already like, and by raiders. */
      if (refusing(ctx) || (p.temper === 'wary' && (band === 'cold' || band === 'neutral')) || p.cls === 'pirate') {
        return sayLine(ctx, p.temper === 'mercenary' ? ['That information has a price.']
                          : ['None of your business.', 'Ask the skipper.', 'We do not talk about the run.'], 'boundNo');
      }
      var b = bound(ctx, ctx.person.route);
      var top = (b.manifest || []).slice().sort(function (x, y) { return (y.qty || 0) - (x.qty || 0); })[0];
      var what = top ? Math.round(top.qty) + ' tonnes of ' + ((Eco && Eco.BY_ID[top.cid] && Eco.BY_ID[top.cid].name) || top.cid).toLowerCase() : 'not much';
      return 'Out to ' + (b.to ? b.to.name : 'the next port') + ' when we are loaded. ' + what.charAt(0).toUpperCase() + what.slice(1) + '.';
    }
  };

  /* ---- aboard her (2026-10-28) ----
   * Astra, on what you can do once you are aboard somebody else's ship:
   * talk to the crew, trade with the captain, recruit, and take cargo. The
   * first is everything above; these are the next two. Cargo is in her
   * hold, not in a conversation. */

  /* Her master opens her books: the same board the comms page shows for a
   * hailed hull (shiptrade.js), at the same prices and with the same
   * refusals — standing moves the price, never the door. main.js opens it
   * when the conversation sets `state.trade`. */
  var DEAL = {
    id: 'deal', label: 'Can we do business?',
    when: function (ctx) {
      if (!ctx.person.master) return false;
      if (refusing(ctx)) return 'not with you';
      /* `contactOf`, not a stored contact: main.js looks her up fresh, since
       * a moored ship's rail position is one frame's. */
      var ST = global.ShipTrade, c = ctx.person.contactOf ? ctx.person.contactOf() : null;
      if (!c) return 'her books are not open to the band';
      var why = ST && c ? ST.refusal(ctx.G, ctx.sys, c) : null;
      return why ? why.replace(/\.$/, '').toLowerCase() : true;
    },
    run: function (ctx) {
      ctx.state.trade = true;
      ctx.state.end = true;
      return sayLine(ctx, ['Here is what is in the hold. Prices are prices.', 'Fine. Let us see what you have got.',
                           'Sit down. I will show you the manifest.'], 'deal');
    }
  };

  /* Poaching a hand off her (Crew records, as the hall's are). A hand
   * walks off a ship for one of two reasons: they like you, or you pay them
   * more than she does — so the fee is the hall's half again, and the
   * unhappy and the loyal do not come at any price. Rating and knack are
   * pure functions of who they are, as everything about them is. */
  var POACH = 1.5;
  var CREW_ROLES = { pilot: true, engineer: true, gunner: true };
  function poachRecord(ctx) {
    var P = ctx.person, r = 1 + (hash('rating|' + P.id) % 4);
    return { id: P.id, name: P.name, role: P.role, rating: Math.max(1, Math.min(5, r)), from: P.shipName || '' };
  }
  function poachFee(ctx) {
    var CrewM = global.Crew;
    return Math.round((CrewM && CrewM.signingFee ? CrewM.signingFee(poachRecord(ctx)) : 400) * POACH);
  }
  var RECRUIT = {
    id: 'recruit', label: function (ctx) { return 'Fly with me instead (' + poachFee(ctx) + ' cr)'; },
    when: function (ctx) {
      var P = ctx.person;
      if (P.master || !CREW_ROLES[P.role]) return false;
      var band = ctx.op.band;
      if (refusing(ctx) || band === 'cold') return 'they would not leave her for you';
      if (ctx.p.values === 'lawful' && band === 'neutral') return 'they signed on for the whole run';
      if (credits(ctx.G) < poachFee(ctx)) return 'you have ' + credits(ctx.G) + ' cr';
      return true;
    },
    run: function (ctx) {
      var CrewM = global.Crew, s = ctx.G.ship, rec = poachRecord(ctx);
      s.credits -= poachFee(ctx);
      (s.crew = (CrewM && CrewM.aboard ? CrewM.aboard(s) : (s.crew || [])).slice()).push(rec);
      record(ctx.G, ctx.p.key, 'hired', ctx.t);
      ctx.state.hired = true;
      ctx.state.end = true;
      return sayLine(ctx, ['I will get my kit. Do not tell the captain until I am off.', 'About time somebody asked.',
                           'Right. I was done with this tub anyway.'], 'poached');
    }
  };

  /* ---- your own crew ---- */
  var STATUS = {
    id: 'status', label: 'How is the ship?',
    run: function (ctx) {
      var s = ctx.G.ship || {}, role = ctx.p.role, f = s.hullMax ? (s.hullHp || 0) / s.hullMax : 1;
      if (role === 'engineer') {
        return 'Hull at ' + Math.round(f * 100) + '%. Jump fuel ' + (s.fuel || 0).toFixed(0) + ' of ' + (s.fuelCap || 0) +
               ' t, thrusters ' + (s.thrusterFuel || 0).toFixed(0) + ' of ' + (s.thrusterCap || 0) + ' t.' +
               (f < 0.6 ? ' I would like a yard to look at her.' : ' She is holding.');
      }
      if (role === 'gunner') {
        var CrewM = global.Crew, kn = CrewM && CrewM.knackOf ? CrewM.knackOf(ctx.person.crew) : null;
        return (s.missiles ? s.missiles + ' missile' + (s.missiles > 1 ? 's' : '') + ' on the rack.' : 'Rack is empty.') +
               ' Forward guns are clean.' + (kn ? ' ' + CrewM.KNACKS[kn].what.charAt(0).toUpperCase() + CrewM.KNACKS[kn].what.slice(1) + '.' : '');
      }
      if (role === 'medic') {
        var n = (global.Crew && global.Crew.aboard ? global.Crew.aboard(s).length : 0);
        return n + ' aboard, and everyone fit to work.' + (f < 0.4 ? ' If she takes any more hits, that will change.' : '');
      }
      return (s.docked ? 'Snug in the clamps.' : 'Steady.') + ' Hull ' + Math.round(f * 100) + '%, ' +
             Math.round((s.cargo ? Object.keys(s.cargo).reduce(function (a, k) { return a + (s.cargo[k] || 0); }, 0) : 0)) +
             ' t in the hold.';
    }
  };
  var MOOD = {
    id: 'mood', label: 'How are you holding up?',
    run: function (ctx) {
      var op = ctx.op, owed = owedDays(ctx.G), why = reasonLine(ctx.G, ctx.sys, op);
      var head = sayLine(ctx, {
        furious: ['Honestly? I am looking for another berth.'], angry: ['Not well, Captain.', 'I have been better.'],
        cold: ['I do the work.', 'Fine. Mostly.'], neutral: ['Fine, Captain.', 'No complaints.'],
        warm: ['Good. Glad to be aboard.', 'Better than most berths I have had.'],
        glad: ['Never better. Best ship I have flown on.'], grateful: ['Never better.']
      }[op.band] || ['Fine.'], 'mood');
      var tail = owed >= 2 ? ' We are ' + owed + ' days behind on wages, though.' : (why && op.band !== 'warm' && op.band !== 'glad' ? ' ' + why : '');
      return head + tail;
    }
  };
  var PRAISE = {
    id: 'praise', label: 'Good work out there.',
    when: function (ctx) {
      var day = Math.floor(ctx.t / DAY);
      return (ctx.m && ctx.m.done && ctx.m.done.praise === day) ? 'you have said so today' : true;
    },
    run: function (ctx) {
      var m = record(ctx.G, ctx.p.key, 'praised', ctx.t);
      m.done = m.done || {}; m.done.praise = Math.floor(ctx.t / DAY);
      return sayLine(ctx, ['Thank you, Captain. That means something.', 'Appreciated.', 'Just doing the job. But thanks.'], 'praised');
    }
  };

  /* ---- the standoff in her airlock (boarding part 3, 2026-10-31) ----
   * You forced her outer door; her master is in the lock with you, her
   * inner door shut behind them. Four ways it can go, each with its odds
   * on the line, and every one of them ends the conversation: Combat.standoff
   * settles it and main.js does what it says (her inner door opens, or you
   * are thrown out into open space, or you climb back out). */
  function standSpec(ctx) { return ctx.person.spec || null; }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function standRun(how) {
    return function (ctx) {
      var Cb = global.Combat, r = Cb && Cb.standoff ? Cb.standoff(ctx.sys, ctx.G, ctx.t, standSpec(ctx), how, null) : { ok: false, line: '...' };
      ctx.state.standoff = { how: how, ok: !!r.ok, thrown: !!r.thrown, back: !!r.back };
      ctx.state.end = true;
      return r.line;
    };
  }
  function standOdds(ctx, how) {
    var Cb = global.Combat;
    return Cb && Cb.standoffOdds ? Cb.standoffOdds(ctx.sys, ctx.G, standSpec(ctx), how) : 0;
  }
  var STAND_THREAT = {
    id: 'sthreat', label: function (ctx) { return 'Stand aside or this gets ugly  (' + pct(standOdds(ctx, 'threaten')) + ')'; },
    run: standRun('threaten')
  };
  var STAND_TALK = {
    id: 'stalk', label: function (ctx) { return 'Nobody has to get hurt over cargo  (' + pct(standOdds(ctx, 'talk')) + ')'; },
    run: standRun('talk')
  };
  var STAND_PAY = {
    id: 'spay', label: function (ctx) {
      var Cb = global.Combat, p = Cb && Cb.standoffPrice ? Cb.standoffPrice(ctx.sys, standSpec(ctx)) : 0;
      return p + ' cr says you never saw me';
    },
    when: function (ctx) {
      var Cb = global.Combat, p = Cb && Cb.standoffPrice ? Cb.standoffPrice(ctx.sys, standSpec(ctx)) : 0;
      return credits(ctx.G) >= p ? true : 'you have ' + credits(ctx.G) + ' cr';
    },
    run: standRun('pay')
  };
  var STAND_BACK = {
    id: 'sback', label: 'All right. I am leaving.',
    run: standRun('back')
  };
  var STANDOFF = [STAND_THREAT, STAND_TALK, STAND_PAY, STAND_BACK];

  /* Who has which topics, after WHO and HEARD and before LEAVE. */
  var TOPICS = {
    yours: [STATUS, MOOD, PRAISE],
    hire: [TERMS, SKILLS, HAGGLE, SIGN],
    shipcrew: [CAPTAIN, BOUND, OWES],
    /* The same crew, aboard their own ship (main.js picks this list when
     * `person.aboard`). DEAL is her master's, RECRUIT the hands'; each
     * hides itself from the other, so five lines is still enough. */
    aboard: [DEAL, RECRUIT, CAPTAIN, BOUND, OWES],
    bartender: [ROUND, TALK, INPORT],
    market: [CHEAP, DEAR, SPECIAL],
    yard: [HULL, PAPERS],
    steward: [HANDS],
    customs: [WARRANT, BUSINESS, TROUBLE],
    marine: [BUSINESS, TROUBLE],
    security: [BUSINESS, TROUBLE, WARRANT],
    fixer: [TITHE, FRIENDS, PAPERS, STANDING],
    factor: [FIRM_WHAT, READING, ENGAGE, ACCOUNT],
    syndicate: [TITHE, STANDING],
    other: []
  };
  /* A sub-menu is a list, or a function of the conversation for one whose
   * rows depend on what you have chosen (the trading house's deal sheet). */
  var SUB = { business: CLAIMS.map(claimTopic), firm: firmSheet, firmgoods: goodsSheet, account: accountSheet };

  /* ---- the conversation ------------------------------------------------------ */
  function ctxOf(G, sys, port, state) {
    var op = opinion(G, sys, port, state.person);
    return { G: G, sys: sys, port: port, person: state.person, p: op.persona, op: op,
             m: memory(G, op.persona.key, false), t: G.t || 0, state: state };
  }

  function labelOf(tp, ctx) { return typeof tp.label === 'function' ? tp.label(ctx) : tp.label; }

  /* The numbered replies, as they stand. Each: { id, label, ok, why }. */
  function options(G, sys, port, state) {
    var ctx = ctxOf(G, sys, port, state), out = [];
    var list;
    /* In her airlock with you uninvited, there is nothing else to say. */
    var sp0 = state.person.spec;
    if (state.person.standoff && !(sp0 && (sp0.yielded || sp0.surrendered))) {
      STANDOFF.forEach(function (tp) {
        var w = tp.when ? tp.when(ctx) : true;
        out.push({ id: tp.id, label: labelOf(tp, ctx), ok: w === true, why: w === true ? null : w, topic: tp });
      });
      return out;
    }
    if (state.node && SUB[state.node]) list = typeof SUB[state.node] === 'function' ? SUB[state.node](ctx) : SUB[state.node];
    else {
      list = [WHO, HEARD].concat((state.person.aboard && TOPICS.aboard) || TOPICS[ctx.p.kind] || []);
      /* A furious face has nothing to say to you but goodbye. */
      if (ctx.op.band === 'furious') list = [];
    }
    list.forEach(function (tp) {
      if (!state.node && state.asked[tp.id] && !tp.repeat) return;
      var w = tp.when ? tp.when(ctx) : true;
      if (w === false) return;
      out.push({ id: tp.id, label: labelOf(tp, ctx), ok: w === true, why: w === true ? null : w, topic: tp });
    });
    if (!state.node) out = out.slice(0, 5);
    out.push({ id: 'leave', label: LEAVE.label, ok: true, why: null, topic: LEAVE });
    return out;
  }

  function open(G, sys, port, person, t) {
    if (!person) return null;
    var state = { person: person, asked: {}, node: null, end: false, line: '', loose: false };
    var ctx = ctxOf(G, sys, port, state);
    var m = memory(G, ctx.p.key, true);
    if (m.met == null) m.met = t;
    ctx.m = m;
    var line = greeting(G, sys, ctx.op, t || 0);
    /* Her master, between you and her inner door. */
    var sp1 = person.spec;
    if (person.standoff && !(sp1 && (sp1.yielded || sp1.surrendered))) {
      line = sayLine(ctx, ['That door is not opening. You have about ten seconds to tell me why it should.',
                           'You cut your way onto my ship. Talk fast.',
                           'Far enough. There are four of us behind that door and one of you.'], 'standoff');
    }
    /* The law asks you first. */
    if ((ctx.p.kind === 'customs' || ctx.p.kind === 'marine') && ctx.op.band !== 'furious' && !(m.done && m.done.asked === Math.floor((t || 0) / DAY))) {
      m.done = m.done || {}; m.done.asked = Math.floor((t || 0) / DAY);
      state.node = 'business';
      line += ' ' + sayLine(ctx, ['What is your business here?', 'State your business, please.', 'Cargo and purpose?'], 'askFirst');
    }
    noteSaid(m, line);
    state.line = line;
    state.speaker = speaker(ctx);
    state.band = ctx.op.band;
    return state;
  }

  function speaker(ctx) {
    var P = ctx.person, p = ctx.p;
    if (p.kind === 'yours') return P.name + ', your ' + p.role;
    if (p.kind === 'factor') { var fw = firmOf(ctx); if (fw) return P.name + ', factor for ' + fw.name; }
    if (P.staff) return P.name + ', ' + P.staff.toLowerCase();
    if (p.kind === 'hire') return P.name + ', looking for a berth';
    if (p.kind === 'shipcrew') return P.name + ' of the ' + (P.shipName || 'ship');
    return P.name;
  }

  /* Pick reply `i` (0-based, as the panel numbers them less one). Returns
   * the state, with `line` their answer and `end` set when it is over. */
  function choose(G, sys, port, state, i) {
    if (!state || state.end) return state;
    var opts = options(G, sys, port, state);
    var o = opts[i];
    if (!o) return state;
    if (!o.ok) { state.line = '(' + o.why + ')'; state.refused = true; return state; }
    state.refused = false;
    var ctx = ctxOf(G, sys, port, state);
    ctx.m = memory(G, ctx.p.key, true);
    var line = o.topic.run(ctx) || '';
    if (!o.topic.sub) state.asked[o.id] = true;
    if (o.topic.end) state.end = true;
    noteSaid(ctx.m, line);
    state.line = line;
    state.band = opinion(G, sys, port, state.person).band;
    return state;
  }

  /* Still close enough to be talking? */
  function inRange(walk, person) {
    if (!walk || !person) return false;
    return Math.hypot((person.x || 0) - walk.x, (person.z || 0) - walk.z) <= TALK_RANGE;
  }

  var Dialogue = {
    persona: persona, opinion: opinion, memory: memory, record: record, open: open, options: options,
    choose: choose, greeting: greeting, inRange: inRange, kindOf: kindOf, classOf: classOf,
    TOPICS: TOPICS, CLAIMS: CLAIMS, EVENTS: EVENTS, TALK_RANGE: TALK_RANGE, _fresh: fresh
  };
  global.Dialogue = Dialogue;
  if (typeof module !== 'undefined' && module.exports) module.exports = Dialogue;
})(typeof window !== 'undefined' ? window : globalThis);
