/* lore.js - the wiki half of the catalogue (2026-11-13).
 *
 * Astra: "a kind of wiki style game encyclopedia with ship hulls, factions
 * (as generated per seed), cargo items and equipment, as well as the
 * descriptions of all relevant types. The ports should also be demonstrated
 * in our game wiki thing."
 *
 * catalogue.js already had four of those: hulls, equipment, trade goods and
 * station modules, all read straight from the live tables. This file is the
 * other three, and they are a different shape of thing.
 *
 *   TYPES    - what a Terran world IS, what a Theocracy does to a market,
 *              what class M means. Finite, seed-independent, always
 *              readable. Facts from the generator's own tables; the prose
 *              is written, because a density and an albedo do not tell a
 *              pilot whether he can put down there without a heat shield.
 *   PORTS    - the fourteen patterns a port is built to. Seed-independent:
 *              the generator picks from these, it does not invent them.
 *   FACTIONS - this seed's actual powers, their capitals and their reach.
 *              NOT seed-independent, and the only part of the page that
 *              has to be earned.
 *
 * ---- WHAT THE WIKI IS ALLOWED TO TELL YOU ------------------------------
 *
 * Astra's call, asked before any of this was built: types always, specifics
 * once met. The game SELLS slipspace charts - whose flag flies over the
 * systems around a port, at 85 cr a star and rising with distance - so a
 * page that listed every faction's territory to a brand-new career would be
 * giving away the thing the chart seller is holding.
 *
 * So: a reader can always look up what a Charter is, what an outlaw band
 * is, how a Syndicate differs from a government. What he cannot do is read
 * off who holds what in HIS galaxy until he has been there or bought the
 * sheet. `knownFactions` is the whole of that rule, and it is deliberately
 * one function: a gate in one place can be audited, a gate in nine cannot.
 *
 * Everything here reads the live tables, same rule as catalogue.js. Add a
 * government to Gen.GOVERNMENTS and it is in the wiki with its numbers.
 */
(function (global) {
  'use strict';

  function Gen() { return global.Gen; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, dp) {
    if (!num(v)) return '';
    var d = dp === undefined ? 2 : dp;
    return String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
  }

  /* ---- WORLD TYPES ------------------------------------------------------
   * The generator's nine. Density, colour and albedo come from
   * Gen.PLANET_TYPES; the air from Gen.ATMOSPHERES, where a null entry is
   * genuine vacuum. The prose is written per type because the useful facts
   * about a world - can I land, do I need a shield, is anybody there - are
   * not in either table. */
  var WORLD_PROSE = {
    molten: 'Rock that has not finished cooling, under four atmospheres of ' +
            'something that eats paint. Nothing lands here and lives, and ' +
            'nothing worth landing for is on the surface. What they are ' +
            'worth is what the heat does to the ground underneath.',
    rocky:  'Airless, cratered, and the easiest thing in the sky to put a ' +
            'hull down on: no weather, no drag, no heating, and the drive ' +
            'does all the work in both directions. Most of the mining ' +
            'ladder is climbed on worlds like this.',
    desert: 'Mars-thin air - about a fiftieth of Earth’s - which is ' +
            'enough to raise dust and not enough to slow you down. You ' +
            'land on the drive. A salt basin reads as ground rather than ' +
            'water, so its ports are buried rather than floating.',
    terran: 'The ones people live on. Breathable air at about a bar, ' +
            'weather over half the sky, and almost always somebody already ' +
            'there - which is why a Terran world in an unclaimed system is ' +
            'worth a second look.',
    ocean:  'Water to the horizon in every direction, and the cloudiest ' +
            'skies in the catalogue. There is rarely anywhere dry to put a ' +
            'pad, so the ports float: a sea platform is an ordinary port ' +
            'that happens to have nothing under it.',
    tundra: 'Cold, thin-aired and habitable at the margins. Half an ' +
            'atmosphere, little weather, and ground hard enough to build ' +
            'on all year. Unglamorous and quietly useful.',
    iceball: 'A frozen ball with a whisper of air - four thousandths of a ' +
            'bar, which is vacuum for every purpose except the limb glow. ' +
            'Lands like an airless rock and keeps whatever is buried in it ' +
            'exactly where it froze.',
    iceGiant: 'No surface to speak of: a deep cold envelope over a slush ' +
            'nobody has stood on. You do not land, you skim - the volatiles ' +
            'in the upper air are the entire reason to come.',
    gasGiant: 'The largest thing in most systems and the one you can never ' +
              'touch. Hydrogen for the taking at the cloud tops, a gravity ' +
              'well that will hold a fleet, and a ring system often enough ' +
              'to be worth the detour.'
  };

  function worldTypes() {
    var G = Gen();
    if (!G || !G.PLANET_TYPES) return [];
    var ATM = G.ATMOSPHERES || {};
    return Object.keys(G.PLANET_TYPES).map(function (id) {
      var t = G.PLANET_TYPES[id], a = ATM[id];
      var specs = [];
      if (num(t.density)) specs.push(['Density', t.density + ' kg/m³']);
      if (num(t.albedo)) specs.push(['Albedo', fmt(t.albedo)]);
      if (a === null || a === undefined) {
        specs.push(['Air', 'none - genuine vacuum']);
        specs.push(['Landing', 'on the drive; no heating, no drag']);
      } else {
        specs.push(['Surface air', fmt(a.rho0, 3) + ' kg/m³' +
                    (num(a.rho0) ? '  (Earth is 1.225)' : '')]);
        specs.push(['Scale height', fmt(a.scaleHeight, 1) + ' km']);
        specs.push(['Cloud', Math.round((a.cloud || 0) * 100) + '% of the sky']);
        specs.push(['Landing', a.rho0 >= 0.5 ? 'wants a heat shield'
                             : a.rho0 >= 0.02 ? 'thin air; the drive does most of it'
                             : 'effectively vacuum']);
      }
      return {
        id: 'world-' + id, name: t.name || id, group: 'types', kind: 'world type',
        swatch: t.color, specs: specs, prose: WORLD_PROSE[id] || '',
        sort: 1
      };
    });
  }

  /* ---- GOVERNMENTS ------------------------------------------------------
   * Two axes, not one (generate.js): violence is how likely somebody is to
   * take your cargo at gunpoint, corruption is how likely the people who
   * are supposed to stop them will look the other way. The crime score the
   * rest of the game reads is a function of both. */
  var GOV_PROSE = {
    anarchy: 'No government at all, and the number that matters is the ' +
             'violence: nobody is coming if it goes wrong. Everything is ' +
             'legal here, which is a different sentence from everything ' +
             'being safe here.',
    feudal: 'Somebody owns this place and everybody knows who. Moderate ' +
            'violence, heavy corruption - the law exists and is for sale, ' +
            'which makes it predictable once you know the price.',
    dictatorship: 'Low violence, high corruption: the state is strong ' +
                  'enough to keep the peace and crooked enough to be ' +
                  'bought. Quiet streets and expensive paperwork.',
    patronage: 'The most corrupt arrangement on the list and nearly the ' +
               'least violent. Nothing happens without a sponsor, and ' +
               'nothing bad happens to you if you have one.',
    theocracy: 'Middling on both axes and strict about things that have ' +
               'nothing to do with trade. The contraband list here is ' +
               'longer and stranger than the crime score suggests.',
    confederacy: 'A loose agreement between places that would rather not ' +
                 'be governed. Light on violence, soft on enforcement, and ' +
                 'inconsistent from one port to the next.',
    collective: 'Decisions made in common, which is slower than it sounds ' +
                'and harder to bribe than it looks. Middling violence, low ' +
                'corruption.',
    corporate: 'The second-lowest violence in the catalogue, bought with ' +
               'the second-highest corruption. Order is a product here and ' +
               'somebody is being billed for it.',
    cooperative: 'Low on both axes and poor on neither. The dull, decent ' +
                 'end of the ladder - not much to exploit and not much to ' +
                 'fear.',
    democracy: 'Low violence, modest corruption, and a high technology ' +
               'floor. The markets are honest and the margins are thin.',
    technocracy: 'The safest and cleanest places in the galaxy and the ' +
                 'hardest to make a crooked credit in. If you are carrying ' +
                 'something you should not be, keep flying.'
  };

  function governments() {
    var G = Gen();
    if (!G || !G.GOVERNMENTS) return [];
    return G.GOVERNMENTS.map(function (g) {
      var specs = [['Violence', String(g.violence) + ' of 100'],
                   ['Corruption', String(g.corrupt) + ' of 100']];
      if (num(g.lowTechBias)) {
        specs.push(['Technology', g.lowTechBias >= 0.8 ? 'low - little is made here'
                                : g.lowTechBias >= 0.5 ? 'mixed'
                                : g.lowTechBias >= 0.25 ? 'high'
                                : 'the best in the galaxy']);
      }
      if (G.permissivity) {
        specs.push(['Crime score', String(Math.round(
          G.permissivity(g.violence, g.corrupt))) + ' of 100']);
      }
      return {
        id: 'gov-' + g.id, name: g.name || g.id, group: 'types',
        kind: 'government', specs: specs, prose: GOV_PROSE[g.id] || '', sort: 2
      };
    });
  }

  /* ---- STAR CLASSES -----------------------------------------------------
   * Weighted toward the small dim stars that actually dominate a galaxy,
   * which is why most systems you jump into are red. */
  var STAR_PROSE = {
    M: 'Red dwarfs, and two stars in five are one. Dim and long-lived, so ' +
       'the habitable band sits close in and the worlds in it are usually ' +
       'tide-locked - one face burning, one frozen, and a ring of weather ' +
       'between them where anybody lives.',
    K: 'Orange and modest. The quiet success of the catalogue: warm enough ' +
       'for a wide habitable band, calm enough that what grows there keeps ' +
       'growing. A disproportionate number of the good worlds are here.',
    G: 'Yellow, Sun-sized, and the obvious place to look for a Terran ' +
       'world. Less common than the orange and red stars that outnumber ' +
       'them, and the systems are correspondingly busier.',
    F: 'White and hot, with the habitable band pushed well out. Short ' +
       'enough lived that whatever is in the band has had less time to ' +
       'become interesting.',
    A: 'Blue-white and fierce. The band is far out and the ultraviolet is ' +
       'punishing; what you find here is minerals and weather, not people.'
  };

  function starClasses() {
    var G = Gen();
    if (!G || !G.STAR_CLASSES) return [];
    var total = G.STAR_CLASSES.reduce(function (a, c) { return a + (c.w || 0); }, 0);
    return G.STAR_CLASSES.map(function (c) {
      var specs = [];
      if (total) specs.push(['How common', Math.round(100 * (c.w || 0) / total) + '% of stars']);
      if (c.mass) specs.push(['Mass', fmt(c.mass[0]) + '–' + fmt(c.mass[1]) + ' suns']);
      if (c.temp) specs.push(['Surface', c.temp[0] + '–' + c.temp[1] + ' K']);
      return {
        id: 'star-' + c.cls, name: 'Class ' + c.cls, group: 'types',
        kind: 'star', swatch: c.color, specs: specs,
        prose: STAR_PROSE[c.cls] || '', sort: 0
      };
    });
  }

  /* ---- PORTS ------------------------------------------------------------
   * FOURTEEN PATTERNS, and the generator picks from them rather than
   * inventing: every port in every seed is one of these built at one of
   * three sizes in one of three liveries. So the patterns belong with the
   * TYPES rather than with the factions - they are seed-independent, and
   * always readable.
   *
   * NO LAYOUT DRAWING. The first cut drew a berth plan off the model's own
   * anchors; Astra scrapped it (2026-11-13: "scrap the port layouts for the
   * game wiki thing"). The berth COUNTS stay, because how many berths a
   * pattern has and how many take a large hull are facts a pilot looking
   * this up wants. What is gone is the picture of where they sit, and
   * `berthPlan` with it: an unused drawing routine kept against a future
   * that may not come is how a file gets heavy.
   *
   * metresPerUnit still earns its place: it answers how big is this thing.
   */
  var PORT_PROSE = {
    cylinder: 'A spun drum with arms off it, and the commonest big station ' +
              'in settled space. The spin is the point: there is real ' +
              'weight inside, which is why people live on one rather than ' +
              'merely working there.',
    ring:     'A wheel with the berths on the inner face. Smaller than a ' +
              'drum and cheaper to throw up, and the usual answer when a ' +
              'system needs somewhere to dock before it needs somewhere to ' +
              'live.',
    spine:    'A long keel with berths hung off both sides and no spin at ' +
              'all. Cargo handling first, comfort never. The pattern you ' +
              'see where the traffic is freight.',
    cradle:   'An open frame that holds hulls rather than enclosing them. ' +
              'Quick to build, easy to extend, and exposed - everything ' +
              'about your ship is visible to everybody on the structure.',
    yard:     'The biggest thing most pilots will ever dock at: ten berths ' +
              'and the slipways to build into them. Where hulls are made ' +
              'and where a wreck goes to be made whole.',
    refinery: 'Ore in at one end, alloys out at the other, and berths ' +
              'enough to keep both moving. Loud, hot, and almost always ' +
              'somebody’s industrial concern rather than a public port.',
    farm:     'Growing space in orbit, turned to the light. No berths worth ' +
              'the name - a farm is a thing supplied rather than a thing ' +
              'visited, and the tenders that service it live elsewhere.',
    skimmer:  'Parked in the upper air of a giant with its intakes open. ' +
              'Hydrogen is the whole business, and the station is built ' +
              'around the scoop rather than the other way round.',
    comet:    'A working camp cut into dirty ice. Small, temporary in ' +
              'spirit if not in fact, and the only port pattern that moves ' +
              'on an orbit nobody chose.',
    'pad-site': 'The plainest thing on a planet: flat ground, lights, and ' +
                'somewhere to stand. You land on the drive and walk off the ' +
                'pad. Most ground ports in the galaxy are this.',
    'pad-city-site': 'The same pads with a city grown up around them. The ' +
                     'approach is busier, the fees are higher, and there is ' +
                     'rather more to do once you are down.',
    'runway-site': 'A strip rather than a pad, for hulls that would rather ' +
                   'arrive with some speed still on. Needs room, so it ' +
                   'turns up on flat open ground.',
    'runway-city-site': 'A strip with a city at the end of it. The busiest ' +
                        'way to arrive on a world, and the one where ' +
                        'traffic control actually means something.',
    'mountain-site': 'Cut into high ground, which buys thin air to land in ' +
                     'and a wall to put the works behind. Awkward to ' +
                     'approach and defensible, which is often the reason it ' +
                     'is there.'
  };
  var LIVERY_NAME = { '': 'civil', navy: 'naval', syn: 'Syndicate' };
  var SIZE_NAME = { s: 'small', m: 'medium', l: 'large' };

  /* Split a PortLib key into pattern, livery and size. The library is keyed
   * <pattern>[-<livery>]-<size>, and the pattern itself may carry hyphens
   * ("runway-city-site"), so the tail is read off the end rather than the
   * head off the front. */
  function splitPortId(key) {
    var m = /^(.*?)(?:-(navy|syn))?-(s|m|l)$/.exec(key);
    if (!m) return null;
    return { pattern: m[1], livery: m[2] || '', size: m[3] };
  }

  function portPatterns() {
    var L = global.PortLib;
    if (!L) return [];
    var by = {};
    Object.keys(L).forEach(function (key) {
      var p = splitPortId(key);
      if (!p) return;
      var rec = by[p.pattern] || (by[p.pattern] = {
        pattern: p.pattern, sizes: {}, liveries: {}, keys: {}
      });
      rec.sizes[p.size] = 1;
      rec.liveries[p.livery] = 1;
      rec.keys[p.size + '|' + p.livery] = key;
    });
    return Object.keys(by).map(function (pat) {
      var rec = by[pat];
      /* The medium civil build is the one shown: the middle of the range,
       * in the colours most of them actually wear. */
      var showKey = rec.keys['m|'] || rec.keys['l|'] || rec.keys['s|'] ||
                    rec.keys[Object.keys(rec.keys)[0]];
      var model = L[showKey] || {};
      var ground = /-site$/.test(pat);
      var berths = (model.geom && model.geom.berths) || 0;
      var docks = (model.extras && model.extras[0] && model.extras[0].data &&
                   model.extras[0].data.docks) || null;
      var specs = [];
      specs.push(['Built', ground ? 'on the ground' : 'in orbit']);
      specs.push(['Sizes', ['s', 'm', 'l'].filter(function (s) { return rec.sizes[s]; })
        .map(function (s) { return SIZE_NAME[s]; }).join(', ')]);
      specs.push(['Flown by', Object.keys(rec.liveries).sort()
        .map(function (v) { return LIVERY_NAME[v] || v; }).join(', ')]);
      if (num(model.metresPerUnit)) {
        specs.push(['Across', Math.round(model.metresPerUnit) + ' m at this size']);
      }
      specs.push(['Berths', berths ? String(berths) : 'none - not a port you dock at']);
      if (docks) {
        specs.push(['Of which', (docks.L || 0) + ' large, ' + (docks.SM || 0) + ' small and medium']);
      }
      return {
        id: 'port-' + pat,
        name: (PORT_NAME[pat] || pat),
        group: 'ports', kind: ground ? 'ground port' : 'orbital port',
        model: null, portKey: showKey, berths: berths, ground: ground,
        specs: specs, prose: PORT_PROSE[pat] || '', sort: ground ? 1 : 0
      };
    });
  }

  var PORT_NAME = {
    cylinder: 'Drum station', ring: 'Ring station', spine: 'Spine station',
    cradle: 'Cradle station', yard: 'Shipyard', refinery: 'Refinery station',
    farm: 'Orbital farm', skimmer: 'Gas skimmer', comet: 'Comet works',
    'pad-site': 'Landing pads', 'pad-city-site': 'City pads',
    'runway-site': 'Runway field', 'runway-city-site': 'City runway',
    'mountain-site': 'Mountain works'
  };


  /* ---- WHAT A POWER IS, before you know which ones yours are -----------
   * Seed-independent and always readable: the SHAPE of the roster. Three
   * empires with powers operating inside them rather than seven peers -
   * that hierarchy is a fact about every galaxy this game builds, so a
   * reader is entitled to it on a brand-new career. */
  var KIND_PROSE = {
    empire: 'One of the three great powers. Each holds a compact core of ' +
            'systems around a capital, with open space between it and the ' +
            'next - the map is three regions, not a chequerboard. Standing ' +
            'with one is worth having and takes work to lose.',
    minor:  'A smaller power operating INSIDE an empire’s space rather ' +
            'than beside it. It flies its own colours and keeps its own ' +
            'books, and its interests are not always its host’s. There ' +
            'is one to each empire.',
    syndicate: 'One organisation across the whole map, however many ' +
               'colours its people fly. It holds no territory it would ' +
               'admit to, buys anything from anybody, and is the only ' +
               'power that will not purchase a position it already owns.',
    band:   'Muscle that split from the Syndicate and keeps a few systems ' +
            'of its own out in the reaches. A band holds ground the way a ' +
            'squatter does: nobody recognises the claim and everybody ' +
            'respects the guns.'
  };
  var KIND_NAME = { empire: 'Empire', minor: 'Minor power',
                    syndicate: 'Syndicate', band: 'Outlaw band' };

  function factionKinds() {
    return ['empire', 'minor', 'syndicate', 'band'].map(function (k, i) {
      return {
        id: 'kind-' + k, name: KIND_NAME[k], group: 'factions',
        kind: 'what a power is', specs: [], prose: KIND_PROSE[k] || '',
        sort: 0, order: i
      };
    });
  }

  /* ---- WHICH ONES ARE YOURS --------------------------------------------
   * THE ONE GATE. Astra's rule: types always, specifics once met.
   *
   * A faction is known once the career has CHARTED or VISITED a system it
   * holds, or has standing with it - which is to say, once the galaxy has
   * actually told you it exists. Buying the local sheet from a chart
   * seller charts those systems, so the wiki fills in behind the purchase
   * rather than instead of it. That is the whole point: this page must
   * never be a cheaper substitute for the thing the game sells.
   *
   * With no career at all (a tool, a test), everything is known - there is
   * no player to spoil.
   */
  function knownFactions(G, galaxy) {
    var gal = galaxy || (G && G.galaxy);
    if (!gal || !gal.factions) return [];
    if (!G) return gal.factions.slice();
    var seen = {};
    var charted = G.charted || {}, visited = G.visited || {};
    for (var i = 0; i < gal.stars.length; i++) {
      var st = gal.stars[i];
      if (!st.factionId) continue;
      if (charted[st.id] || visited[st.id]) seen[st.factionId] = 1;
    }
    /* Standing counts too: somebody who has dealt with you has introduced
     * themselves, whether or not you have been to their space. */
    var st2 = G.standing || {};
    Object.keys(st2).forEach(function (k) { if (st2[k]) seen[k] = 1; });
    if (G.marks) Object.keys(G.marks).forEach(function (k) { seen[k] = 1; });
    return gal.factions.filter(function (f) { return seen[f.id]; });
  }

  function kindOf(f, gal) {
    if (!f) return 'empire';
    if (f.id === 'outlaw') return 'syndicate';
    if (f.outlaw) return 'band';
    return f.parentId ? 'minor' : 'empire';
  }

  function factions(G, galaxy) {
    var gal = galaxy || (G && G.galaxy);
    if (!gal || !gal.factions) return [];
    var Gx = global.Galaxy;
    var known = knownFactions(G, gal);
    var charted = (G && (G.charted || {})) || {};
    var visited = (G && (G.visited || {})) || {};
    var everything = !G;

    return known.map(function (f) {
      var kind = kindOf(f, gal);
      var specs = [];
      /* HOW MUCH OF ITS SPACE YOU HAVE SEEN, not how much it has. The
       * count is of systems you know about, so it grows as you explore
       * rather than handing you the map. */
      var held = 0, total = 0;
      for (var i = 0; i < gal.stars.length; i++) {
        var st = gal.stars[i];
        if (st.factionId !== f.id) continue;
        total++;
        if (everything || charted[st.id] || visited[st.id]) held++;
      }
      specs.push(['Kind', KIND_NAME[kind]]);
      if (f.parentId && gal.factionById && gal.factionById[f.parentId]) {
        specs.push(['Operates inside', gal.factionById[f.parentId].name]);
      }
      var cap = gal.byId && gal.byId[f.capitalId];
      if (cap) {
        var capKnown = everything || charted[cap.id] || visited[cap.id];
        specs.push(['Capital', capKnown ? (cap.name || cap.id) : 'not on your charts yet']);
      }
      specs.push(['Systems you know of', held + (everything ? '' : ' of theirs') ]);
      if (!everything && held < total) {
        specs.push(['', 'buy the local sheets to fill this in']);
      }
      /* Rivalries, but only between powers you have both met. */
      if (Gx && Gx.rivalsOf) {
        var rivals = known.filter(function (o) {
          return o.id !== f.id && Gx.rivalsOf(gal, f.id, o.id);
        }).map(function (o) { return o.name; });
        if (rivals.length) specs.push(['At odds with', rivals.join(', ')]);
      }
      if (G && G.standing && G.standing[f.id] !== undefined) {
        var M = global.Missions;
        specs.push(['Your standing', (M && M.standingLabel
          ? M.standingLabel(G.standing[f.id], G, f.id) : String(G.standing[f.id])) +
          ' (' + G.standing[f.id] + ')']);
      }
      return {
        id: 'fac-' + f.id, name: f.name || f.id, group: 'factions',
        kind: KIND_NAME[kind].toLowerCase(), swatch: f.color,
        specs: specs, prose: KIND_PROSE[kind] || '',
        /* WHERE THIS ENTRY POINTS. Its kind always, and the power it
         * operates inside when there is one and you have met them too - a
         * link to a faction the player has never heard of would be the
         * gate leaking through the back door. */
        links: (function () {
          var out = [{ group: 'factions', id: 'kind-' + kind,
                       label: 'What a ' + KIND_NAME[kind].toLowerCase() + ' is' }];
          if (f.parentId) {
            var parent = gal.factionById && gal.factionById[f.parentId];
            var met = known.some(function (o) { return o.id === f.parentId; });
            if (parent && (everything || met)) {
              out.push({ group: 'factions', id: 'fac-' + parent.id,
                         label: parent.name });
            }
          }
          return out;
        })(),
        sort: 1, order: kind === 'empire' ? 0 : kind === 'minor' ? 1 :
                       kind === 'syndicate' ? 2 : 3
      };
    });
  }

  /* How much of this seed's roster the career has met, for the page to say
   * so plainly rather than leaving a short list looking like a bug. */
  function factionProgress(G, galaxy) {
    var gal = galaxy || (G && G.galaxy);
    if (!gal || !gal.factions) return { known: 0, total: 0 };
    return { known: knownFactions(G, gal).length, total: gal.factions.length };
  }


  /* ---- THE THREE GROUPS, in the order a reader wants them -------------- */
  var GROUPS = [
    { id: 'factions', label: 'FACTIONS', note: 'who holds what, once you have been there' },
    { id: 'ports',    label: 'PORTS',    note: 'the fourteen patterns, and where the berths are' },
    { id: 'types',    label: 'TYPES',    note: 'worlds, stars and the governments over them' }
  ];

  function types() {
    return starClasses().concat(worldTypes(), governments());
  }

  function all(G, galaxy) {
    return factionKinds().concat(factions(G, galaxy), portPatterns(), types());
  }

  /* Sorted the way the subject wants reading, not alphabetically: stars
   * before the worlds that orbit them, orbital ports before ground ones,
   * and a power’s kind before the powers themselves. */
  function groups(G, galaxy) {
    var items = all(G, galaxy), by = {};
    items.forEach(function (e) { (by[e.group] || (by[e.group] = [])).push(e); });
    return GROUPS.map(function (g) {
      var list = (by[g.id] || []).slice();
      list.sort(function (a, b) {
        if ((a.sort || 0) !== (b.sort || 0)) return (a.sort || 0) - (b.sort || 0);
        if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return { id: g.id, label: g.label, note: g.note, items: list };
    }).filter(function (g) { return g.items.length > 0; });
  }

  function find(G, id, galaxy) {
    var items = all(G, galaxy);
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  var Lore = {
    GROUPS: GROUPS,
    worldTypes: worldTypes, governments: governments, starClasses: starClasses,
    portPatterns: portPatterns, splitPortId: splitPortId,
    factionKinds: factionKinds, factions: factions,
    knownFactions: knownFactions, factionProgress: factionProgress, kindOf: kindOf,
    types: types, all: all, groups: groups, find: find,
    WORLD_PROSE: WORLD_PROSE, GOV_PROSE: GOV_PROSE, STAR_PROSE: STAR_PROSE,
    PORT_PROSE: PORT_PROSE, PORT_NAME: PORT_NAME, KIND_PROSE: KIND_PROSE,
    KIND_NAME: KIND_NAME, LIVERY_NAME: LIVERY_NAME, SIZE_NAME: SIZE_NAME
  };
  global.Lore = Lore;
  if (typeof module !== 'undefined' && module.exports) module.exports = Lore;
})(typeof window !== 'undefined' ? window : globalThis);
