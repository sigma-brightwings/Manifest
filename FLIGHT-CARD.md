# First flight

Double-click `index.html`. No server needed. Seed goes in the URL fragment:
`index.html#kawartha` is the system everything has been developed against.

**Press `H` in game for the authoritative control list** — it is generated from the
real bindings, so it cannot drift from what the code actually does. What follows is
a suggested route through the features, not a manual.

---

## The screens

`F1` is flying. Every other function key takes the **whole display** for one job,
the way a real multi-function display does — you are either flying or you are
reading, and the old 178-pixel instrument band was pretending you could do both.

| | |
|---|---|
| `F1` | Main view — press again to flip cockpit / exterior chase camera |
| `F2` | Orbit map — the boot view: system from outside, orbit lines on |
| `F3` | Local navigation — contacts, lock, scope, autopilot |
| `F4` | Comms |
| `F5` | Ship status & inventory |
| `F6` | Galaxy map & course plotter |
| `F7` | Mission status |
| `F8` | Jump to hyperspace |
| `F9` | Keyboard / mouse aim |
| `F10` | Cargo manifest |
| `Shift`+`F2` | Manoeuvre planning |

`1`–`0` do the same thing, for browsers with opinions about F1 and F5. `Esc`
always comes back to the cockpit. **The icon bar along the bottom is clickable,
and so is everything on a screen** — the nav list, the star chart, the eject
buttons.

---

## A ten-minute route

Do these in order. Each one exercises something nobody has ever looked at.

**1. Just look.** You start in orbit above a world with a station. Drag to orbit the
camera, wheel to zoom. Is the scale readable? Can you tell what you are looking at?

**2. `F1` — get in the cockpit, and `F1` again to step outside.** One key flips
between first person and a chase camera parked close enough to admire your own
hull (`Enter` still works too). Drag to look around inside; `Home` re-centres.
The band along the bottom is only what you *touch* (burn rose, throttle, tanks),
the scope, and what the ship most needs to tell you.

**2a. `K` — stow the band and fly on the console instead.** The dashboard has
five screens on it now: three on an arc in front of you at ten, twelve and two,
angled toward the seat, and two more on the rear bulkhead — because you can now
turn a full 180° and a cockpit that rewards looking behind you with a blank wall
teaches you not to look. **Click any panel to change what it shows** (scope,
**aft**, orbit, target, nav, ship, cargo, autopilot, node, system). The band and
the console want the same pixels at the bottom of the screen and no window size
gives both, so `K` chooses: band, console instruments, or bare canopy.

**AFT is the one to try first.** It is a camera looking backwards — stars,
worlds, and every contact behind you boxed with its range, hostiles in red, with
a line underneath saying what is back there and whether it is closing. The
rear-left panel starts on it. It is not a second render of the world (that would
cost more than the rest of the frame); it is built from the same world data
through a reversed camera, so it is a real view rather than a diagram.

Look down and you will find **a window in the floor**, seen through a slot cut
down the middle of the console. It is there for the last hundred metres onto a
pad, which used to be flown with the thing you were landing on hidden behind
the dashboard the whole way down.

**2b. `F2` — the orbit map.** The view the game boots into, kept on its own key:
the system from outside with orbit lines forced on. Drag to turn it, wheel to
zoom, `Tab` walks the camera through the bodies, or click them in the list —
click again to lock one as your nav target. Leaving hands your camera back
exactly as you left it.

**3. `F9` — try mouse aim.** Two ways to fly, one switch: the mouse turns your
head, or the mouse points the nose — and with it on, the nose follows the mouse
with no button held, so mouse 1 and 2 become the two fire groups and the middle
button launches. `Enter` toggles; the sensitivity is on the same screen.

**4. `F3` — local navigation.** Everything in the system, nearest first, with the
lock in detail beside it and the scope at full height. `[` and `]` cycle the lock
from anywhere; on this screen you can also just click a contact.

**5. Fly manually.** `W`/`S` prograde and retrograde, `A`/`D` radial, `R`/`F` normal.
Arrow keys and `Q`/`E` point the nose — attitude is independent of thrust. Watch for
the exhaust plume. `V` toggles the predicted trajectory, which is the best thing in
the game and has been there since the beginning.

**6. Lock a station, `T`, then `T` again.** First press assigns the docking clamp,
second engages auto-dock. It should wind the clock up, fly the approach, wind it
back down and latch on. Any manual burn takes control back.

**From anywhere, now.** It used to refuse past 300,000 km, which made it a
parking assistant. It now spins the cruise drive up itself for the long leg,
winds the speed up and back down against the distance left, drops out near the
station and flies the approach it always flew — two million km away is a
four-second trip and then a normal docking. Two more autopilots on the same
idea: **`Shift+T` matches orbit** with whatever you have locked (kills the
relative velocity and stops — the manoeuvre that turns a flyby into a
rendezvous), and **`Shift+L` follows** it and holds station off it until you
cancel. Both work on ships as well as worlds.

**7. `M` while docked — trade.** Arrow keys buy and sell, `F` refuels.
Look for **Radioactive waste**: industrial worlds *pay you* to take it. Roughly
9,000 credits a run against your 3,200 starting balance, if you can find a
reprocessing plant to dump it at.

**8. `F5` — throw something out of the airlock.** Every cargo line has EJECT 1t and
EJECT ALL beside it; `Del` and `Shift+Del` do the same from the keyboard. Fitted
equipment is listed on the same screen and deliberately has no button.
What you eject becomes a **canister on your old trajectory** — it falls, it shows
on the scope as a yellow cross, and it is still there if you come back for it.
The point is the mass budget: a full hold cannot outrun a pirate, and this is the
lever that argument leaves you holding.

**Salvage.** A ship you destroy comes apart, and some of the pieces still carry
what was in its hold. Drift onto one gently — the same 80 metres and 20 m/s a
canister wants — and it goes aboard. On the scope an **amber cross is worth
taking** and a **grey dot is scrap**; the scrap is drawn because a debris field
you cannot see is a debris field you fly into. Wreckage clears after about a
minute and a half, or the moment you leave the area.

**9. `Z` — cruise.** Only works well clear of a planet. `,` and `.` set speed. The
starfield should streak. **I suspect it is too fast to aim** — it tops out around
six times lightspeed and a turn takes seconds.

**10. `F6`, then `F8`.** The chart lays in a course (`Enter`, or click a star); the
drive screen engages it. Seven seconds of tunnel, and days of game time pass. Check
the market has moved when you arrive.

**11. Find a surface starport.** Habitable worlds have them; high-gravity worlds are
not allowed any, because a laden ship could not take off again. Landing on a pad is
a dock, not a crash.

**Watch somebody else do it.** Traffic uses the ports the way you do now:
a freighter inbound to a pad flies a descent, stands on its tail as it gets
close, and sits ON the pad for its layover instead of hovering a few kilometres
above it — and one bound for an underground bay goes down the shaft and is not
there any more until it climbs back out. Park off a busy world and watch the
timetable arrive.

**11b. Find an underground bay.** Some surface ports — more often on the airless
and inhospitable worlds — are buried instead of built in the open: a collar and a
ring of lights mark a hole in the ground from orbit, with a shaft dropping away to a
chamber below. Comms and the nav list call these out as "Underground Bay" rather
than "Starport" so you know before you arrive. Lock one, fly it, or `T`-`T` to let
auto-dock line up over the mouth and take you straight down — same capture-and-land
as any pad, just tighter (2.4x radius, 18 m/s) because you are landing inside a
wall on every side rather than in the open. Undocking climbs back up the same shaft.

---

## Fighting, robbing, and getting paid

**Guns.** `Space` fires down the nose, `B` launches a missile at the locked
ship. You start with a photon pulse laser; the yard sells nine, an auto-turret
that fires itself at hostiles, a self-charging shield, and Hawk missiles.
Everything upgradable is on `F5` while docked, next to hull repairs.

**Fire groups.** A hull with more than one hardpoint has two triggers, because
a beam strips a shield and a pulse opens a hull, and carrying both is the point.
Every gun starts on group A; **click a gun on `F5` to move it to B** — from the
fitted list, in flight, not only at a yard. Then:

| | Group A | Group B | Missile |
|---|---|---|---|
| Keyboard | `Space` | `Shift`+`Space` | `B` |
| Cockpit, mouse aim (`F9`) | mouse 1 | mouse 2 | mouse 4, or the wheel click |
| Exterior view | *(Space)* | mouse 2 | mouse 4, or the wheel click |

Hold either; hold both. With mouse aim on, the mouse flies the ship with no
button held, which is what frees the buttons up to be triggers. In the
exterior view mouse 1 stays the camera, because swinging the view around
the ship is what that view is for.

**Hold right `Alt` to look around** without letting go of the ship — the
mouse turns your head instead of the nose, and releasing it puts the view
back where it was. (Left `Alt` is the other one: it hands the mouse to the
interface.)

**The tracers tell you which gun is firing.** A pulse throws a bolt, an
intermittent a broken line, a beam a solid one — all of them widest and
brightest at the muzzle. They travel slowly enough to see, which is a lie
told only to your eyes: the weapon is hitscan and the shot has already
landed before the first pixel is drawn.

**No firing under time compression.** Drop to 1x (`,`) first — at warp your
guns cycle every frame and the shot cannot be aimed at anything.

**Beams heat your own hull.** Every shot puts its rated waste heat into the
ship, and the catalogue prints the figure. A bare hull sheds 18 units a second,
so a photon beam (12/s) can be held down forever, a kaon beam (26/s) gives you
about twelve seconds, and a muon beam (46/s) under four. The ablative heat
shield covers all of them, which quietly makes a re-entry module combat gear —
and a **heat sink** buys about ten seconds of continuous heavy fire per charge,
then goes overboard white-hot with your heat in it, where anyone can see it.

**Getting shot.** Shields soak first and recharge when things go quiet; hull
does not — repairs cost credits at the yard. At zero hull you lose the ship,
the cargo and the fittings, never the credits or the reputation. Pirates whose
demands you stall for thirty seconds stop asking.

**And you feel it from the seat.** A hit that reaches the hull flares red
through the whole cabin, and can take a console screen out with it — cracked,
dark, flickering, and useless until a yard replaces the glass (240 cr a panel,
on the same invoice as the hull). Losing the scope mid-fight means losing the
thing that tells you where your attacker is, which is the point. It never takes
your last screen, and the damage survives a save the way a dented hull does.

**Missions (`F7`).** Every port keeps a board: freight hauls, sealed-parcel
couriers to neighbouring stars, waste disposal runs. Deadlines are real —
a blown one fines you and the faction remembers. Standing and warrants both
live on this screen.

**Piracy (`F4` → pick a ship → `Piracy…`).** Demand cargo or credits. Armed
threats work on freighters; empty ones amuse them; trying it on the law starts
a fight. The rules of getting caught are the whole game: a witness within
150,000 km reports you instantly, otherwise the victim needs ten seconds to
get its distress call out — and a ship destroyed before it transmits was never
robbed at all. Wanted means police shoot on sight and that faction's stations
refuse you dock (surface pads still work — the smuggler's route). Pay the
bounty off at 160% somewhere that still takes your calls.

**Ships.** Four hulls at the yard: the Talon you fly, a Dart that outruns
everything and carries nothing, a Kestrel that compromises well, and a Mule
that is slow, vast, and worth robbing. Trade-in at 70% of list; every hull can
lift off every surface port that exists — the liftoff rule is enforced in the
catalogue and pinned by a test.

**The fleet has real hulls now.** All 24 of your .glb models are imported —
open `hulls.html` to see every one spinning, labelled with its ID. The game
casts models to roles by ID in `Render.HULL_ASSIGN` (defaults follow the
filenames: trader-m flies the trade runs, police-m the patrols, fighter-m the
pirates, tug-m the waste haulers; capital-\* is imported and waiting for a
job). Tell me what any ID should be and it's a one-line change — or live, via
`Render.assignHull('pirate', 'fighter-s')`. New models: drop .glb files in a
folder and run `node tools/glb2hulls.js <folder>`.

**Every ship carries a registration** — two letters, four digits, deterministic
forever (yours is on F5; theirs are on the target page and the comms channel).

**The career persists.** Auto-saved every dock and on closing the tab, per
seed. `N` deliberately starts over. Sound is synthesised live — thrust rumble,
lasers, the dock clunk — and unmutes on your first keypress.

---

## What is new and least tested

- **Combat balance.** 875 automated tests pin the mechanisms — witness logic,
  missile guidance, trade-in maths — but whether a pirate fight is FUN at these
  numbers is a judgement no test can make. Damage, ranges and prices all live at
  the top of `src/combat.js` and want your opinion.
- **The trader hull.** The ship you fly is the low-poly trader from Claude
  Design, per-part colour and all. Police, pirates, freighters and the rest still
  have their own silhouettes — say the word and they get the same treatment.
- **NPC gunnery is abstract** — a hit-chance roll per shot rather than simulated
  bolts, with your transverse speed genuinely making you harder to hit. Dodge by
  thrusting sideways, not by jinking the nose.
- **Underground bays are new.** The generation, docking and undocking are pinned
  by tests; the shaft and chamber are one shared low-poly mesh rather than a
  hand-built model per bay, and I have not yet flown one live in a browser myself
  to confirm the approach reads well at every window size — that is worth an
  honest look before calling it finished.
- **The console panels are a judgement call about legibility.** They were
  removed once for exactly this reason: instruments in perspective are harder
  to read than instruments drawn square. They are back because a lit console
  that is doing something is most of what makes a cockpit a cockpit — but the
  flat band still carries every number, and `K` is there because I do not think
  one answer suits everyone. Tell me which of the three you actually fly in.
- **The panel geometry was tuned at 800 × 697 in a browser**, not derived. The
  layout is angular so it holds at other sizes, but the arc is as wide as it can
  be before the outer screens walk off the side of a narrow window — if yours is
  much wider or much taller than that, I want to know what it looks like.
- **The autopilot's cruise leg burns real reaction mass** — about two tonnes
  for two million km in testing. That is a cost I picked by not thinking about
  it, and it wants your opinion more than my arithmetic does.
- **The predicted path is now a few frames old rather than a few frames long.**
  The integration was 8-25 ms landing inside one frame, four to twelve times a
  second — the stall you could feel while burning. It is the same arithmetic,
  now spent 3 ms at a time across frames and collected when it finishes.
  Measured here while thrusting: median frame 4.9 ms → 3.9 ms, worst 14 ms →
  9 ms, and the path itself is identical point-for-point (pinned by a test).
  If you can still feel a hitch under thrust, I want to know — the remaining
  spikes are the impact scan, which only runs with prediction OFF (`V`).
- **Traffic landing on pads is new and unproven at close range.** The approach
  is an interpolation, not a flown landing: it is right at both ends and
  plausible in between, but I have not watched one come down from the ground
  next to it. If it looks like a ship being dragged rather than flying, say so.

## What is most useful to tell me

Screenshots beat descriptions. Failing that:

- your window size, and whether anything overlaps
- anything unreadable — too small, wrong colour, behind something else
- anything that *feels* wrong even if it works: too slow, too fast, too fiddly
- anything you expected to be able to do and could not find

If it throws, the error is painted on the canvas in red rather than vanishing into
the console — but the browser console (`F12`) will have the stack.
