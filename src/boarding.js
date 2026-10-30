/* boarding.js — asking to come aboard a ship in space, and the tube that
 * joins you to her while you are (2026-10-29).
 *
 * Astra, on boarding: three ways aboard (docked beside her at a station,
 * invited in space, a disabled ship by force), a standoff you talk your way
 * through when her crew do not want you, and once aboard: talk, trade with
 * the captain, recruit, take cargo. On how you cross in open space she
 * agreed (2026-10-29): INVITED is a boarding tube she runs out from her
 * hatch to yours — her running it out IS her saying yes — and BY FORCE is a
 * spacewalk. This file is the invited half.
 *
 * HOW IT GOES. You ask over the band while she is within ALONGSIDE_KM. If
 * she says yes she drops off her lane (Combat.liftTrader, the same lift a
 * robbery uses), comes down to your speed, and closes to a tube's length
 * off your hull (sim.js steerNpc, mode 'alongside'). Once she is there and
 * still relative to you, the tube runs out; from then you ride with her
 * (main.js holdTether) until it is reeled in, and she goes back to her lane.
 *
 * WHY SHE COMES TO YOU, NOT YOU TO HER. Measured 2026-10-29: a trader on
 * her lane is crossing the system at 50–600 km/s, and a rail ship's `vel`
 * does not even agree with how her position moves (mismatches of 30–400
 * km/s) — so "match her speed and close to two km" was a gate nobody could
 * pass. A ship that has agreed to take you aboard heaves to; that is what
 * agreeing means.
 *
 *   ask(G, sys, t, contact)  -> { ok, why, line }   pure
 *   gate(G, contact)         -> null | why           the flying half alone
 *   join(G, sys, t, contact) -> ask's answer; on yes she heaves to
 *   release(G, sys)          -> reel in; she goes back to her lane
 *   herState(sys, t, name)   -> her, now, off the list the scope reads
 *   settle(G, sys, t)        -> 'joined' the frame the tube reaches you
 *
 * Plain IIFE on `global`, `module.exports` for the tests. */
(function (global) {
  'use strict';

  var ALONGSIDE_KM = 25;       // ask within this; she comes the rest of the way
  var TUBE_KM = 0.030;         // the tube holds you this far off her
  var MEET_KM = 0.060;         // close enough for the tube to reach
  var MEET_KMS = 0.006;        // and still enough for it to take up
  var SLOT_KM = 0.005;         // in a slot, she must be within 5 m of it
  var GIVE_UP_S = 600;         // she does not hold alongside forever

  function Vx() { return global.V; }

  /* Who will not have you aboard, whatever you say: warships and the law,
   * and raiders, who would rather you came over the side so they could keep
   * your ship. Each with the line her master gives. */
  var NEVER = {
    capital: 'A warship does not take visitors.',
    navy: 'This is a naval vessel. Make an appointment.',
    police: 'You are not under arrest. Keep it that way.',
    cutter: 'This is a naval vessel. Make an appointment.',
    pirate: 'Come closer and find out what happens.'
  };

  function clsOf(c) { return (c && (c.cls || c.kind || (c.route && c.route.cls))) || ''; }

  function gate(G, c) {
    var v = Vx(), s = G && G.ship;
    if (!c || !c.pos || !s) return 'no channel open';
    if (s.docked || s.landed) return 'you are moored';
    var d = v.dist(c.pos, s.pos);
    if (d > ALONGSIDE_KM) return 'close to under ' + ALONGSIDE_KM + ' km  (' + (d < 100 ? d.toFixed(1) : Math.round(d)) + ' km)';
    return null;
  }

  function ask(G, sys, t, c) {
    if (!c) return { ok: false, why: 'no channel open' };
    if (c.hostile) return { ok: false, why: (c.name || 'She') + ' is not answering' };
    if (G.ship && G.ship.tether) return { ok: false, why: 'you are already joined to the ' + G.ship.tether.name };
    var never = NEVER[clsOf(c)] || NEVER[c.kind || ''];
    if (never) return { ok: false, why: 'her master will not have you aboard', line: never };
    if (!c.route) return { ok: false, why: 'she has no berth for visitors' };
    /* Adrift (upkeep.js) she has nothing to come alongside WITH: the
     * approach is hers to fly (Sim.steerNpc 'alongside'), and her tank is
     * gone. Going to her instead is boarding's third slice. */
    var Up = global.Upkeep, sdA = Up && Up.eligible(c.route) ? Up.stranded(c.route, sys, t) : null;
    if (c.adrift || (c.spec && c.spec.adrift) || (sdA && sdA.adrift)) {
      return { ok: false, why: 'her tank is gone; she cannot come alongside',
               line: 'We would, if we could make way. Pass us some mass and ask again.' };
    }
    var g = gate(G, c);
    if (g) return { ok: false, why: g };
    /* The record gates lawful ships, as her trade board does: wanted by her
     * flag and her hatch stays shut, in the same words. */
    var ST = global.ShipTrade;
    var tradeWhy = ST && ST.refusal ? ST.refusal(G, sys, c) : null;
    if (tradeWhy && !/range|channel|shop/i.test(tradeWhy)) return { ok: false, why: tradeWhy.replace(/\.$/, '') };
    /* And what her master thinks of you: the opinion the band greets you
     * with (captains.js). Cold or worse, the reel stays on its drum. */
    var C = global.Captains, op = null;
    try { op = C && C.opinion && (!C.hasCaptain || C.hasCaptain(c)) ? C.opinion(G, sys, c) : null; } catch (e) { op = null; }
    var band = op && (op.band || (C.bandOf ? C.bandOf(op.score) : null));
    if (band === 'furious' || band === 'angry' || band === 'cold') {
      return { ok: false, why: 'her master does not trust you', line: band === 'cold' ? 'I do not know you well enough for that.' : 'Not a chance.' };
    }
    if (c.route.runner && ((G.standing && G.standing.outlaw) || 0) < 0) {
      return { ok: false, why: 'the Syndicate does not know you', line: 'We do not take passengers. Not you, anyway.' };
    }
    return { ok: true, line: band === 'warm' || band === 'glad' || band === 'grateful'
                               ? 'Come aboard. We are coming about to you now.'
                               : 'All right. Hold where you are and we will come to you. Keep your hands where we can see them.' };
  }

  /* Her, now — BY HER ROUTE, NOT HER NAME. Names repeat in a system (two
   * "Slipstream Runner"s on one comms list, 2026-10-28), and the first
   * probe of this file followed the wrong one: she was coming alongside
   * while the tube was being held to a namesake three million km away.
   * `key` is her route id where she has one (a tether keeps it), else a
   * name. Lifted, she is her live agent; otherwise her place on the list. */
  function herState(sys, t, key) {
    var S = global.Sim;
    if (!S || !S.shipsAll || !sys) return null;
    var spec = specOf(sys, key);
    if (spec) return spec.live ? spec.live : null;
    var list = S.shipsAll(sys, t), byName = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      if (e.route && e.route.id === key) return e;
      if (!byName && e.name === key) byName = e;
    }
    return byName;
  }
  function specOf(sys, key) {
    var ps = (sys && sys.patrols) || [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.dead || !p.liftedFrom) continue;
      if (p.liftedFrom.id === key || p.name === key) return p;
    }
    return null;
  }

  /* She says yes and heaves to. Kept: who she is and when you asked. Never
   * saved (save.js names the ship fields it keeps, and this is not one):
   * a load puts you in your seat beside a ship back on her lane. */
  function join(G, sys, t, c) {
    var r = ask(G, sys, t, c);
    if (!r.ok) return r;
    var Cb = global.Combat, spec = Cb && Cb.liftTrader ? Cb.liftTrader(sys, c, t) : null;
    if (!spec || !spec.live) return { ok: false, why: 'she could not come about' };
    /* Off her drive and down to your speed: what heaving to means. */
    spec.live.vel = Vx().clone(G.ship.vel || { x: 0, y: 0, z: 0 });
    spec.mode = 'alongside'; spec.modeSince = 0; spec.standoffKm = TUBE_KM;
    G.ship.tether = { name: c.name, key: c.route.id || c.name, joined: false, dir: null, tube: 0, asked: t };
    return r;
  }

  /* Each frame while she is coming: the frame she is close and still, the
   * tube runs out and you are joined. She gives up if it takes too long. */
  function settle(G, sys, t) {
    var tt = G.ship && G.ship.tether, v = Vx();
    if (!tt || tt.joined) return null;
    var her = herState(sys, t, tt.key || tt.name);
    if (!her) { G.ship.tether = null; return 'gone'; }
    if (t - tt.asked > GIVE_UP_S) { release(G, sys); return 'gaveup'; }
    /* Close and still means close to HER SLOT where she has one (main.js
     * alongsideSlot: a place in your frame, belly to belly or beside you),
     * and lying the way the slot lies; otherwise the old centre-to-centre
     * tube's length. */
    var sj = specOf(sys, tt.key || tt.name), slot = sj && sj.slot, s = G.ship, d;
    if (slot) {
      var aim = v.add(s.pos, v.add(v.add(v.scale(s.right, slot.off[0]), v.scale(s.up, slot.off[1])), v.scale(s.fwd, slot.off[2])));
      d = v.dist(her.pos, aim);
      if (her.fwd && v.dot(her.fwd, s.fwd) < 0.98) d = Infinity;
    } else {
      d = v.dist(her.pos, s.pos);
    }
    var rel = v.dist(her.vel || s.vel, s.vel);
    if (d < (slot ? SLOT_KM : MEET_KM) && rel < MEET_KMS) {
      var off = v.sub(s.pos, her.pos), n = v.len(off);
      tt.dir = n > 1e-9 ? v.scale(off, 1 / n) : v.clone(s.up);
      tt.slot = slot || null;
      tt.joined = true; tt.tube = 0;
      /* From here she flies the pair and you ride with her (sim.js). */
      if (sj) sj.tubeJoined = true;
      return 'joined';
    }
    return null;
  }

  /* Reeled in, from either end, for any reason: she goes back to her lane
   * (breakoff, then reapLifted puts her back on her timetable once she is
   * out of sight). */
  function release(G, sys) {
    var tt = G && G.ship && G.ship.tether;
    if (!tt) return false;
    var spec = specOf(sys || (global.Game && global.Game.sys), tt.key || tt.name);
    if (spec) spec.tubeJoined = false;
    if (spec && spec.mode === 'alongside') { spec.mode = 'breakoff'; spec.modeSince = 0; }
    G.ship.tether = null;
    return true;
  }

  var Boarding = { ask: ask, gate: gate, herState: herState, specOf: specOf, join: join, release: release, settle: settle, SLOT_KM: SLOT_KM,
                   ALONGSIDE_KM: ALONGSIDE_KM, TUBE_KM: TUBE_KM, MEET_KM: MEET_KM, MEET_KMS: MEET_KMS, NEVER: NEVER };
  global.Boarding = Boarding;
  if (typeof module !== 'undefined' && module.exports) module.exports = Boarding;
})(typeof window !== 'undefined' ? window : globalThis);
