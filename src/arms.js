/* arms.js - a tug's grab arms, worked from the seat (2026-10-31).
 *
 * Astra: "the [tug's] cockpit should have a vidscreen to operate those grab
 * arms", and asked that they grab canisters, tow disabled ships, and move
 * station modules. The Bollard and the Hawser (combat.js HULLS, grabArms)
 * carry the arms; render.js draws them past the glass and, now, the arm
 * camera's screen (drawArmCam).
 *
 * ONE CONTROL: G closes the jaws, and G again opens them. What they close
 * on is whatever is IN REACH when they shut - the space just ahead of the
 * point where the jaw tips meet (Render.armGrip), at a crawl relative to
 * you. Closing on nothing is closing on nothing.
 *
 *   A CANISTER is held at the jaws, then swung in: after STOW_S seconds it
 *   is in the hold, if there is room. No scoop needed - that is what the
 *   arms are for. No room: it stays in the jaws until you let it go.
 *
 *   A DISABLED SHIP is clamped where she was when the jaws shut, in your
 *   frame, and comes with you: she turns as you turn, and her mass is
 *   added to yours (ship.armLoad, read by Sim.shipMass), so a laden tug
 *   pushing a freighter accelerates like one. Dock with her on the arms
 *   and the harbour takes her: salvage paid by the tonne - unless she is a
 *   ship you were seen to attack, which no harbour pays you for.
 *
 *   A STATION CRATE floating at a founding (stations.js) is lifted out of
 *   her ring and carried: bring it to her frame - within INSTALL_KM of the
 *   Crawler - and it is in at once, out of her crew's queue. Its mass is
 *   on the arms while you carry it. Let go short of her and her crew lines
 *   it back up in the ring.
 *
 * Nothing here is saved. A load lets go of whatever the jaws held; a ship
 * clamped at the moment of the save is where she was, adrift.
 */
(function (global) {
  'use strict';
  var V = global.V || (typeof require !== 'undefined' ? require('./vec3.js') : null);

  var REACH_KM = 0.012;          // 12 m ahead of the jaws
  var CAN_REACH_KM = 0.010;      // a canister's own 4 m in that
  var MATCH_KMS = 0.004;         // 4 m/s relative: a crawl
  var NEAR_KM = 0.25;            // what the arm camera bothers to show
  var STOW_S = 5;                // the swing from the jaws to the hatch
  var JAW_RATE = 1.6;            // of travel per second
  var CRATE_REACH_KM = { S: 0.006, M: 0.008, L: 0.012, XL: 0.016 };  // half a crate, and the jaws
  var SALVAGE_PER_T = 20;        // cr a tonne, harbour salvage: a hauler's
                                 // 320 t is 6,400 cr, a good hold's worth

  function hasArms(ship) {
    var H = global.Combat && global.Combat.HULLS;
    return !!(ship && H && H[ship.hullId] && H[ship.hullId].grabArms);
  }
  function state(ship) {
    if (!ship.arms) ship.arms = { want: 0, jaw: 0, held: null };
    return ship.arms;
  }
  function grip(frame) {
    var R = global.Render;
    return R && R.armGrip ? R.armGrip(frame) : null;
  }
  function shipsNear(G, pos) {
    var Sim = global.Sim, out = [];
    var list = (Sim && Sim.shipsAll && G.sys) ? Sim.shipsAll(G.sys, G.t) : [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || o.dead || !o.pos || !o.fwd) continue;
      if (V.dist(o.pos, pos) > NEAR_KM + (o.size || 0.05)) continue;
      out.push(o);
    }
    return out;
  }
  function specOf(o) { return (o && o.spec) || null; }
  function disabledShip(o) {
    var s = specOf(o);
    return !!(s && s.disabled && s.live);
  }
  function mass(spec, o) {
    var R = global.Render;
    /* Her length off her spec first: the traffic state carries no length
     * of its own, and hullLength on it is the 25 m default. */
    var Lkm = spec.size || (o && o.size) || (R && R.hullLength ? R.hullLength(o) : 0.04);
    var Lm = Lkm * 1000;
    return spec.mass || (spec.live && spec.live.mass) || Math.round(60 * Math.pow(Math.max(10, Lm) / 25, 2.4));
  }

  /* What the jaws would close on now, and what is near enough to show. */
  function survey(G, frame) {
    var s = G.ship, g = grip(frame);
    if (!g) return null;
    var fwd = s.fwd, best = null, near = [];
    (G.sys && G.sys.canisters || []).forEach(function (c) {
      if (!c || !c.pos) return;
      var d = V.dist(c.pos, g);
      if (d > NEAR_KM) return;
      near.push({ kind: 'canister', pos: c.pos, held: c._inJaws });
      if (c._inJaws) return;
      var rel = V.dist(c.vel || s.vel, s.vel);
      var ahead = V.dot(V.sub(c.pos, g), fwd);
      if (d <= CAN_REACH_KM && ahead > -0.004 && (!best || d < best.d)) {
        best = { kind: 'canister', obj: c, d: d, rel: rel, name: c.torpInert ? 'disarmed torpedo' : 'cargo canister' };
      }
    });
    var Sts = global.Stations;
    (Sts && G.sys ? Sts.cratesHere(G, G.sys, G.t || 0) : []).forEach(function (c) {
      var d = V.dist(c.pos, g);
      if (d > NEAR_KM) return;
      near.push({ kind: 'crate', pos: c.pos });
      var rel = V.dist(c.vel || s.vel, s.vel);
      if (d <= (CRATE_REACH_KM[c.size] || 0.008) && (!best || d < best.d)) {
        best = { kind: 'crate', obj: c, d: d, rel: rel, name: c.name.toLowerCase() };
      }
    });
    var R = global.Render;
    shipsNear(G, g).forEach(function (o) {
      near.push({ kind: 'ship', state: o });
      var sp = specOf(o);
      if (s.arms && s.arms.held && s.arms.held.spec === sp) return;
      var rel = V.dist(o.vel || s.vel, s.vel);
      var tip = V.addScaled(g, fwd, REACH_KM);
      var hit = R && R.hullSegmentHit ? R.hullSegmentHit(o, g, tip, 0.002) : null;
      if (!hit) return;
      var d = hit.t * REACH_KM;
      if (!best || d < best.d) {
        best = { kind: 'ship', obj: o, spec: sp, d: d, rel: rel, name: o.name || (sp && sp.name) || 'a hull',
                 ok: disabledShip(o) };
      }
    });
    return { grip: g, best: best, near: near };
  }

  function say(hooks, m, s) { if (hooks && hooks.say) hooks.say(m, s || 5); }

  /* G: shut the jaws on what is in reach, or open them. */
  function toggle(G, frame, hooks) {
    var s = G.ship;
    if (!hasArms(s)) { say(hooks, 'No grab arms on this hull - a tug carries them', 4); return { ok: false }; }
    if (s.docked || s.landed) { say(hooks, 'Not while she is berthed', 3); return { ok: false }; }
    var st = state(s);
    if (st.want > 0.5) { release(G, hooks); st.want = 0; return { ok: true, open: true }; }
    st.want = 1;
    var sv = survey(G, frame), b = sv && sv.best;
    if (!b) { say(hooks, 'The jaws close on nothing', 3); return { ok: true, empty: true }; }
    if (b.rel > MATCH_KMS) {
      say(hooks, 'Too fast to take hold - ' + Math.round(b.rel * 1000) + ' m/s against you. Match to under ' +
          Math.round(MATCH_KMS * 1000) + '.', 5);
      return { ok: true, empty: true };
    }
    if (b.kind === 'canister') {
      b.obj._inJaws = true; b.obj.armed = false;
      st.held = { kind: 'canister', can: b.obj, at: G.t, name: b.name };
      say(hooks, 'Jaws shut on a ' + b.name + ' - swinging it in', 4);
      return { ok: true, held: 'canister' };
    }
    if (b.kind === 'crate') {
      var Sts = global.Stations, fd = Sts && Sts.byId(G, b.obj.station);
      if (!fd) return { ok: true, empty: true };
      fd.held = b.obj.idx;
      var Cn = global.Construction;
      var tonnes = Math.round(Sts.cubesOf(b.obj.crateId) * ((Cn && Cn.TONNES_PER_CUBE) || 25));
      st.held = { kind: 'crate', station: fd.id, idx: b.obj.idx, name: b.name, size: b.obj.size, mass: tonnes, at: G.t };
      s.armLoad = tonnes;
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      say(hooks, 'Jaws shut on the ' + b.name + ' - ' + tonnes + ' t. Carry it to her frame and it goes in.', 6);
      return { ok: true, held: 'crate' };
    }
    if (!b.ok) {
      say(hooks, 'The jaws close on the ' + b.name + '\'s hull and slip: she is under way. Only a dead ship can be taken in tow.', 6);
      return { ok: true, empty: true };
    }
    var o = b.obj, sp = b.spec;
    var d = V.sub(o.pos, s.pos);
    var lf = function (v) { return { x: V.dot(v, s.right), y: V.dot(v, s.up), z: V.dot(v, s.fwd) }; };
    st.held = { kind: 'ship', spec: sp, name: b.name, id: sp.id || o.id,
                off: lf(d), hf: lf(sp.live.fwd || s.fwd), hu: lf(sp.live.up || s.up),
                mass: mass(sp, o), at: G.t };
    s.armLoad = st.held.mass;
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
    say(hooks, 'Clamped on the ' + b.name + ' - ' + Math.round(st.held.mass) + ' t on the arms. Dock with her to hand her in.', 7);
    return { ok: true, held: 'ship' };
  }

  function release(G, hooks) {
    var s = G.ship, st = s.arms;
    if (!st || !st.held) return;
    if (st.held.kind === 'canister' && st.held.can) {
      st.held.can._inJaws = false;
      st.held.can.vel = V.clone(s.vel);
      say(hooks, 'Let go of the ' + st.held.name, 3);
    } else if (st.held.kind === 'crate') {
      var fd = global.Stations && global.Stations.byId(G, st.held.station);
      if (fd && fd.held === st.held.idx) fd.held = null;
      s.armLoad = 0;
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      say(hooks, 'Let go of the ' + st.held.name + ' - her crew lines it back up in the ring', 4);
    } else if (st.held.kind === 'ship') {
      if (st.held.spec && st.held.spec.live) st.held.spec.live.vel = V.clone(s.vel);
      s.armLoad = 0;
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      say(hooks, 'Let go of the ' + st.held.name + ' - she drifts', 4);
    }
    st.held = null;
  }

  function back(s, l) {
    return V.add(V.add(V.scale(s.right, l.x), V.scale(s.up, l.y)), V.scale(s.fwd, l.z));
  }

  /* Each frame, after the world has moved: the jaws travel, what they hold
   * comes with you, a canister is stowed, a ship is handed in at a dock. */
  function update(G, frame, dt, hooks) {
    var s = G.ship;
    if (!s || !s.arms) return;
    var st = s.arms;
    var step = JAW_RATE * Math.max(0, Math.min(dt || 0, 0.25));
    st.jaw = st.jaw < st.want ? Math.min(st.want, st.jaw + step) : Math.max(st.want, st.jaw - step);
    var h = st.held;
    if (!h) return;
    if (h.kind === 'canister') {
      var c = h.can, g = frame ? grip(frame) : null;
      var cans = (G.sys && G.sys.canisters) || [];
      if (!c || cans.indexOf(c) < 0) { st.held = null; return; }
      if (g) { c.pos = V.clone(g); c.vel = V.clone(s.vel); }
      if ((G.t || 0) - h.at >= STOW_S) {
        if (c.torpInert && global.Mining && global.Mining.recoverInert) {
          if (global.Mining.recoverInert(G, c, hooks)) { cans.splice(cans.indexOf(c), 1); st.held = null; st.want = 0; }
          return;
        }
        var Sim = global.Sim;
        var free = s.cargoCap - (Sim ? Sim.cargoMass(s) : 0);
        if (!(c.tonnes > 0) || !c.cid) { cans.splice(cans.indexOf(c), 1); st.held = null; st.want = 0; return; }
        if (free < 1e-6) {
          if (!h.full) { h.full = true; say(hooks, 'Hold full - the canister stays in the jaws', 4); }
          return;
        }
        var take = Math.min(c.tonnes, free);
        s.cargo[c.cid] = (s.cargo[c.cid] || 0) + take;
        c.tonnes -= take;
        var good = global.Economy && global.Economy.BY_ID[c.cid];
        say(hooks, 'Stowed ' + take.toFixed(1) + ' t ' + (good ? good.name : c.cid) + ' through the hatch', 4);
        if (c.tonnes <= 1e-6) cans.splice(cans.indexOf(c), 1);
        else c._inJaws = false;
        if (Sim && Sim.refreshShip) Sim.refreshShip(s);
        st.held = null; st.want = 0;
      }
      return;
    }
    if (h.kind === 'crate') {
      var Sts = global.Stations, fd = Sts && Sts.byId(G, h.station), gp = frame ? grip(frame) : null;
      /* Her crew got to it first: nothing left to carry. */
      if (!fd || fd.held !== h.idx || Sts.schedule(fd).crateIn[h.idx] <= (G.t || 0)) {
        st.held = null; st.want = 0; s.armLoad = 0;
        if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
        return;
      }
      h.pos = gp;
      if (gp && Sts.atFrame(fd, G.sys, G.t || 0, gp) && Sts.installByHand(fd, h.idx, G.t || 0)) {
        st.held = null; st.want = 0; s.armLoad = 0;
        if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
        var left = fd.crates.length - Sts.cratesIn(fd, G.t || 0);
        say(hooks, 'The ' + h.name + ' is in - ' + (left ? left + ' to go' : 'that was the last of them'), 5);
        if (hooks && hooks.sound) hooks.sound('dock');
      }
      return;
    }
    if (h.kind === 'ship') {
      var sp = h.spec;
      if (!sp || sp.dead || !sp.live) { st.held = null; s.armLoad = 0; return; }
      if (s.docked) { handIn(G, hooks); return; }
      sp.live.pos = V.add(s.pos, back(s, h.off));
      sp.live.vel = V.clone(s.vel);
      sp.live.fwd = V.norm(back(s, h.hf));
      sp.live.up = V.norm(back(s, h.hu));
      sp.live.right = V.norm(V.cross(sp.live.fwd, sp.live.up));
    }
  }

  /* Docked with her on the arms: the harbour takes her. */
  function handIn(G, hooks) {
    var s = G.ship, st = s.arms, h = st && st.held;
    if (!h || h.kind !== 'ship') return null;
    var sp = h.spec;
    var port = G.sys && G.sys.byId ? G.sys.byId[s.docked] : null;
    /* A ship you were seen to attack is evidence, not salvage. */
    var yours = !!(sp.reported || sp.distressKind || sp.surrendered || sp.robbedBy);
    var pay = yours ? 0 : Math.round(SALVAGE_PER_T * (h.mass || 0));
    s.credits = (s.credits || 0) + pay;
    sp.towedIn = (port && port.id) || true;
    sp.dead = true;
    sp.live = null;
    st.held = null; st.want = 0; s.armLoad = 0;
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
    var line = yours
      ? (port ? port.name : 'The harbour') + ' takes the ' + h.name + ' in. Nobody pays salvage on a ship they watched you shoot.'
      : (port ? port.name : 'The harbour') + ' takes the ' + h.name + ' off your arms - salvage, ' + pay + ' cr';
    say(hooks, line, 8);
    if (hooks && hooks.ledger) hooks.ledger(line, 'salvage');
    if (hooks && hooks.sound && pay) hooks.sound('pay');
    return { pay: pay, yours: yours };
  }

  /* For the arm camera's screen. */
  function view(G, frame) {
    var s = G.ship;
    if (!hasArms(s)) return null;
    var st = state(s), sv = survey(G, frame) || { near: [] }, b = sv.best;
    var out = { jaw: st.jaw, near: sv.near };
    if (st.held && st.held.kind === 'crate') {
      /* THE TIP CAMERA'S READOUT (Astra, 2026-10-31: "the tugs need a fwd
       * camera on the end of one of the arms, and a screen in the cockpit
       * for when there's a crate in the arms"). The crate fills the arm
       * camera, so the screen on the arm's end says where her frame is:
       * how far to her, how fast you are closing, and whether you are in. */
      var Sts = global.Stations, fd = Sts && Sts.byId(G, st.held.station);
      var pose = fd && G.sys ? Sts.crawlerPose(fd, G.sys, G.t || 0) : null;
      out.crateSize = st.held.size || 'M';
      if (pose) {
        var gp = grip(frame) || s.pos;
        var to = V.sub(pose.pos, gp), d = V.len(to);
        var closing = d > 1e-9 ? -V.dot(V.sub(s.vel, pose.vel), V.scale(to, -1 / d)) : 0;
        out.frame = { name: fd.name, crawler: { hullId: 'crawler', pos: pose.pos, fwd: pose.fwd, up: pose.up, right: pose.right,
                                                livery: fd.crawler && fd.crawler.livery, modules: [] },
                      dist: Math.round(Math.max(0, d - Sts.INSTALL_KM) * 1000), closing: (closing * 1000).toFixed(1),
                      inside: d <= Sts.INSTALL_KM };
      }
    }
    if (st.held) {
      out.held = st.held.kind === 'ship'
        ? 'the ' + st.held.name + ', ' + Math.round(st.held.mass) + ' t'
        : st.held.kind === 'crate'
        ? 'the ' + st.held.name + ' - carry it to her frame'
        : st.held.name + (st.held.full ? ' - hold full' : ' - swinging it in');
      return out;
    }
    if (b) {
      out.target = b.name;
      out.dist = Math.round(b.d * 1000);
      out.rel = (b.rel * 1000).toFixed(1);
      out.inReach = b.rel <= MATCH_KMS && (b.kind === 'canister' || b.kind === 'crate' || b.ok);
      if (b.kind === 'ship' && !b.ok) out.note = 'under way - only a dead ship can be towed';
      else if (b.rel > MATCH_KMS) out.note = 'match speed to under ' + Math.round(MATCH_KMS * 1000) + ' m/s';
    }
    return out;
  }

  var Arms = {
    REACH_KM: REACH_KM, MATCH_KMS: MATCH_KMS, STOW_S: STOW_S, SALVAGE_PER_T: SALVAGE_PER_T,
    hasArms: hasArms, survey: survey, toggle: toggle, release: release,
    update: update, handIn: handIn, view: view
  };
  global.Arms = Arms;
  if (typeof module !== 'undefined' && module.exports) module.exports = Arms;
})(typeof window !== 'undefined' ? window : globalThis);
