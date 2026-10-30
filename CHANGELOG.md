# Changelog

## What Manifest is

Manifest is a procedural space sim built from the ground up, literally:
gravity first, then the planets that make it, then everything that flies
between them. One seed always grows the same galaxy (`kawartha`,
`beaverton`, `driftwood`, `manifest` ...), so a star system you flew last
month is the same system today, down to where each port sits and what its
warehouses hold on a given date. Time is part of the seed too: traffic,
markets and orbits are functions of the clock, so skipping six months gives
the answer flying them would have.

You fly a ship under real Newtonian flight and Kepler orbits: no rails for
the player, a cockpit with an attitude ladder, MFD pages and a ship screen
with guarded switches where a switch should be guarded. Around that sits a
working economy (ports sell what they make and buy anything, and prices are
stock), factions and their law, the Syndicate and its runners, rescue
services, crew and a fleet, industry you can buy into, and a mining ladder
climbed one rung at a time: survey, claim, cut, and eventually your own
skimmers and stations. It is a desktop game (Electron), developed and tested
on a modest machine (Syndicate Crawler, an RX 540) so it has to run on one.

Releases have a number and a pigeon's name. Everything that changes the
game is entered below with its date, under **Unreleased** until it ships;
when changes are grouped into a release commit, the section takes the
version number.

---

Revisions of Manifest (once Procedural Space Game). Newest first.

Each release gets: **Added** (new things you can do), **Changed** (things
that behave differently than they did), **Fixed** (things that were wrong),
and **Saves** (whether an existing career survives). That last heading is
not optional — a player who has flown a seed for a week deserves to know
before they update.

---

## Unreleased

Since Abby. Changes made on the 1.1 line after the release was cut.

### Added

- **A NOTES tab on the F5 ship screen (2026-10-30).** Astra: *"add a Notes
  section to the F5 menu, under a new tab."* She chose both a notepad and a
  log the game keeps, saved with the game and exportable to a file.
  - **Tab order:** STATUS, GUNS, PANELS, then NOTES (Tab cycles; the tabs are
    clickable).
  - **The notepad** (left).
    - Click it, press Enter or W, or press WRITE to type.
    - It is multi-line: Enter is a new line. Backspace and Delete work, with
      Ctrl to delete a word. The arrows move the caret, Ctrl+arrows move a word,
      Home/End go to the line's ends, Ctrl+Home/End to the text's, and Page
      Up/Down move a page. Ctrl+V pastes.
    - Clicking puts the caret where you clicked. Long lines wrap.
    - While you write, it takes the whole keyboard, so a 7 in a note does not
      flip an instrument page.
    - Esc stops writing and throws nothing away, because the text goes into
      the save as you type it. Leaving the tab stops writing too.
    - Capped at 20,000 characters.
  - **Who owes whom** (top right): read off the captains' own memories, so
    it always matches what a captain will say to you. Captains who owe you
    come first (green), then the ones you owe (amber), each with the reason.
    `Favours.addDebt` now keeps the ship's name on the memory (`who`,
    `debtAt`). A memory saved before this shows the ship's id instead.
  - **Ship's log** (bottom right): newest first, with ALL / PEOPLE / CRIME /
    TRADE / TRAVEL filters. The arrows, Page Up/Down and the wheel scroll it.
    Each entry has its kind, the game clock and the star you were at. The same
    line twice within a minute is folded into one, counted. The last 300 are
    kept.
  - **What gets written to the log:**
    - rescues (each load of mass passed, and the payment);
    - hold-ups (cargo dumped, cash box, transfer, purse);
    - being robbed;
    - every crime reported, with the bounty and the faction's name;
    - witnesses paid or leaned on;
    - bounties cleared and turning yourself in;
    - kills;
    - favours called in, asked back, given or refused;
    - captains who join you as partner or crew;
    - the Syndicate tithe, paid or refused;
    - contracts and passages, done or failed;
    - every ledger line: market and ship-to-ship trades, wages and berthing,
      fleet arrivals, hulls and modules delivered, a tender's rescue of you;
    - arrivals in a system (marked the first time), and dropping out of
      slipspace in deep space.
    `hooks.ledger(text, kind)` takes an optional kind, so a cash box or a
    rescue payment is filed under what it was rather than as trade.
  - **EXPORT** (or E) downloads a .txt: the notes, who owes whom, then the
    whole log. It is CRLF for Notepad, and named after the ship and the game
    clock. The game runs with no Node in the page, so this is the browser's
    own download, and Electron asks where to save it.
  - On the notes tab, Del no longer reaches the inventory's jettison, so it
    cannot throw out cargo you cannot see.
  - New `src/journal.js` (global `Journal`). `test/journal.test.js` (56 checks)
    covers the log, the debts, the export, the notepad's editing, and saving.
    `render.test.js` drives the tab through the real keyboard handler.
    `upkeep.test.js` checks that a rescue and a hold-up land in the log.

- **The walkway inside the ship is dressed (2026-10-30).** Astra: *"add some
  more detail to the walkway inside the ship."* The passage was ribs, one light
  strip, lockers and two hazard lines in a dark box. Now it has:
  - floor plates, with a tread runner down the middle;
  - kick plates along both walls, with low path lights set in them;
  - panel seams on the walls between the ribs;
  - a handrail at hip height down the port wall;
  - two pipe runs under the ceiling, with coloured bands, and a cable tray on
    the other side;
  - vent grilles in the ceiling either side of the light;
  - a fire extinguisher by the aft door and a first-aid box by the fore one;
  - lit signs with arrows: BRIDGE (LIFT on the decked hulls), CARGO, and
    AIRLOCK beside its door. Each arrow points the way along the passage, as
    seen from the wall it hangs on.
  - Everything stays within 16 cm of a wall or lies flat on the floor, so the
    walkway is as wide as it was. `boarding.test.js` checks this on all 18
    one-deck hulls. Nothing draws from the rng, so no deck lays out
    differently.

- **A container for each kind of cargo (2026-10-30).** Astra: *"let's
  create some different models for the different cargo types."* Claude
  Design drew nine from the brief, and they now fill every hold:
  - The nine: a freight crate, a bulk hopper, a cryo tank, a liquid tote, a
    reefer, a livestock pen, a shielded cask, a secure case and a lumber
    stack. Each has its placard pictogram and its own lamp.
  - Every commodity ships in one of them (`CargoKit.kindFor`): hydrogen and
    military drive fuel in cryo tanks; ores, rare metals and grain in
    hoppers; water, chemicals and wine in totes; fish, fruit, medicine and
    gene therapies chilled; livestock penned; waste and fissiles in casks;
    computers, AI cores, luxuries and fusion cells locked; timber strapped;
    everything else crated.
  - Each container's manifest strip prints the real cargo's name in a
    5x7 pixel font.
  - Containers face the aisle and stack two high, not three. At a metre
    tall, a third would reach the lights. A full hold is now two to a slot,
    and each stack's label gives tonnes to a tenth under 100 t, so the
    labels still add up to the manifest.
  - How it is built: the sheet is in `ref/cargo/`, as the GLBs and
    `cargo_specs.json`. `tools/cargo-kit.cjs` reads the parts (boxes,
    cylinders, a square hopper, the cask's lid disc) and samples each
    placard's texture onto a 16x16 grid of its two colours. It writes
    `src/cargokit-data.js`, and `src/cargokit.js` builds the containers
    into the hold's own vertex-coloured mesh. There are no textures and
    nothing new to load. A full 2.5x Mule hold (68 stacks) comes to about
    72k triangles.
  - `boarding.test.js`: there are nine kinds; every commodity has one;
    each container builds whole and fits its 1.1 m slot; two stack under
    the lights; the strip spells the cargo; and a full hold stays a
    reasonable mesh.

- **Other ships carry fuel and money, and some run dry (2026-10-30).**
  Astra: *"how expensive would it be to track her money and fuel? Having
  other ships in need of fuel can give us a reason to buy a rescue tender
  for ourselves."* Nothing is simulated tick by tick: like the timetable,
  all of it is worked out from the clock (`src/upkeep.js`).
  - **Her tank.** She leaves full, arrives with 60% left, and refills early
    in her layover. It grows with her size, the way her hold does.
  - **Her purse.** Her float, plus her cut of each leg (5% of what she
    carries), paid over to her owners every six legs.
  - **Breakdowns.** On about one leg in eighty a scheduled trader's
    reaction-mass tank lets go early in the leg (8-22% of the way). She
    burns what is left to go into orbit where she is, then drifts on that
    orbit, tumbling slowly. Feeders, the heavies and your own fleet never
    break down. In the survey that is about one ship adrift per system
    every four to five days (288 in 26,852 legs).
  - **Her mayday is real.** While she is adrift she is on the distress
    band, the beacon follows her, and the call says what she needs:
    *"Anyone with 20 tonnes of mass to spare, we will pay."* The port she
    was bound for sends a tug, which reaches her 12-48 hours later and
    always before her next departure. After that she is in her berth and
    back on her timetable.
  - **Passing her mass.** F4 on her call: "Pass her reaction mass", within
    50 km and matched to 100 m/s, with "Lock her up" to put the nav lock on
    her. Hydrogen in your hold goes first, then your own tank above a 2 t
    reserve. A part-load is banked, so a second trip can finish it. That is
    what a tender, or a hold full of hydrogen, is for.
  - **When she has enough**, she pays what she can from her purse (1.5x
    hydrogen's price plus 400 cr for the trip), owes you a favour,
    remembers that you saved her ship, and flies herself home from where
    she is. Once she is out of sight she is back on her timetable, and that
    leg stays rescued.
  - **Her screens show it.** Aboard her, the SHIP page shows her purse next
    to her name, and her real reaction mass, with "TANK GONE" when it has.
  - **Saved:** `npcLedger` holds what you passed, what was paid and which
    legs you rescued, keyed by system and route. It is put back on the
    routes after a load.
  - **The schedule's own maydays are bait only now.** `messages.js` used
    to put real traders on the band as well, and they were phantoms: the
    ship named in the call flew on along her timetable while her beacon
    sat where she wasn't. Real maydays now come only from ships that are
    really adrift. Pirate lures stay at about the same share of the band
    where pirates work (3% of four-hour slots).
  - Rumours' berthing times follow a breakdown too: a ship that broke
    down tells the port she was bound for when the tug brings her in.
  - `test/upkeep.test.js` (46 checks): how often legs break, that she is
    exactly where her timetable had her at the leak, that she stays on a
    bound orbit clear of the body, the tow, the tank and purse curves, the
    call, a part-load and a second trip, being paid, flying home, and
    surviving a save. `messages.test.js` now pins bait-only, and
    `rumours.test.js` checks berths against the real states.

- **Boarding, slice two: aboard a ship in space, by invitation (2026-10-29).**
  Within 25 km of a trader, F4 offers "Ask to come aboard". If she agrees
  ("Hold where you are and we will come to you"), she leaves her lane and
  comes alongside to 30 m off your hull.
  - Her tube runs out to your hatch over six seconds; the contacts box
    follows it: "coming alongside", "running her tube out", "tube made
    fast".
  - While joined, she flies the pair and you ride with her: her drives go
    cold and she coasts on her own orbit. Time runs at normal speed.
  - O gets you up; your airlock cycles out into the tube instead of
    onto a ramp; down the tube and up into her airlock; her controls
    cycle you in. Her crew are aboard and her master will talk to you.
  - Back the same way. U in the seat, or "Reel the tube in" on F4, lets
    her go, and she goes back to her lane.
  - She gives up after ten minutes if you never get close enough.
  - `tools/probe-tube.js` (muted) runs the whole loop: she joined in 37 s
    from 7.7 km, held 30.0 m for the walk across and back, and her
    velocity changed by 0.11 m/s (gravity) while joined.
- **Conversations work with the mouse (2026-10-29).** Astra: *"NPC
  dialogue trees should be mouse-navigable."* Clicking a reply already
  chose it, but nothing on the panel showed that.
  - The reply under the pointer now lights up with a bar and a ▶.
  - The pointer becomes a hand over a reply you can choose; a greyed-out
    reply shows its reason without changing the pointer.
  - When the conversation is over, a click anywhere on the panel walks on.
  - The number keys still work. The probe (`tools/probe-talk-mouse.js`,
    muted) hovers, clicks a reply, clicks Goodbye and clicks the panel shut,
    using the mouse alone.

- **Boarding, slice one: aboard another ship at a station (2026-10-28).**
  Astra chose boarding to come next, in three ways (docked beside her at a
  station, invited in space, a disabled ship by force), with a standoff
  you talk your way through when her crew don't want you there. Once
  aboard you can talk to the crew, trade with the captain, recruit, and
  take cargo. A ship ends up disabled in either of two ways (her drive
  knocked out, or her crew surrendering), and those are slices two and
  three. This is the first.
  - **Every ship moored at the port has a berth and a hatch on the
    station deck** (`walk.js` `others`). E on her hatch takes you up into
    her airlock, the way your own does. The deck grows berths to fit
    everyone without changing what its seed draws.
  - **She is walked as a real hull.** Her class flies the same library
    model as one of the player hulls (`hullForClass`, measured: every
    traffic class has one), so her rooms are `Render.shipInterior`'s and
    her airlock is `airlock.js`'s. Every walking path that used to say
    `G.ship` (the frame, the airlock, the ramp, the lift) now asks
    `walkHull()`. Your own airlock keeps running while you're aboard her.
  - **Her crew are the faces from the concourse** (`Npc.visitScene` over
    `crewForShip`). Her master holds her helm. Her gunner, engineer and
    co-pilot take her consoles. Hands with no console stand their watch
    where they belong: marines at the airlock, a loadmaster in the hold, a
    medic in the medbay.
  - **What you can say aboard** (`dialogue.js`):
    - her master offers *"Can we do business?"*, which opens the
      hailed-ship trade board on the comms page, at its prices and with
      its refusals;
    - her pilot, engineer or gunner can be asked to *"Fly with me
      instead"*. That costs half again the crew hall's signing fee, and
      the hand refuses if they're cold toward you, or lawful and only
      neutral. Their rating is a pure function of who they are. Once
      signed, they leave her deck and the bar.
  - **Her hold says what is really in it**: her contact's manifest
    through `Combat.holdOf`, the same source her trade board, a robbery
    and a kill all read. Moored, a ship has usually unloaded, so the line
    says so and names the load going in for her next run.
  - **Her consoles are hers.** Her seat, stations, turret and drive
    console tell you whose they are rather than letting you sit down.
- **Crates in a hold are what is in it (2026-10-28).** From the open
  list: *"cargo crates are random. They don't reflect what's actually in
  your hold."*
  - Yours and hers are now stacked from the cargo (`shipdeck.js` `load`,
    `Render.holdLoad`): none in an empty hold, every slot three high in a
    full one, filled from the door aft.
  - Each crate is tinted by the goods in it, so one cargo reads as one
    colour and a mixed hold as bands.
  - The room is rebuilt when the hold changes by a tenth or its goods
    change, not on every tonne.
  - With no ship to ask, the old seeded scatter is unchanged.

- **Women and men, every skin tone, every build (2026-10-26).** Astra: *"We
  should make sure that the female characters are well represented in race
  and bust size, as it is important."*
  - Who is a woman is decided per person (`People.sexOf`), and the portrait
    follows the body under the suit, so the sketch and the figure agree.
  - **The split (same evening).** Astra: *"let's be representative of how
    it's a nearly 50/50 split, in terms of men and women born, gender
    identity notwithstanding, and that smaller, more violent cultures might
    only survive by keeping the women out of the fighting."* So
    (`People.P_MALE`):
    - **Big societies** (civilian, navy, Syndicate) sit near the birth ratio
      overall, about 52% men, with a mild tilt: 60% men in the fighting jobs
      (marines, tactical, heavies, enforcers, security, gunners) and 44% in
      the rest.
    - **Pirates** are the small, violent culture. About 95% of their fighters
      are men; the women aboard (about 65%) keep the ship running.
  - Women and men both come in all seven skin tones at even odds, measured
    over 3,000 people: no tone is favoured for either sex.
  - Women's bodies come in five bust sizes (`People.BUSTS`: 0.45, 0.65, 0.85,
    1.0 and 1.15 of the stock body), seeded per person. The shape is changed
    before the body is measured, so vests, harnesses and plates are fitted to
    her, not to the stock body.
  - A woman's portrait draws from the same features, eased: a lighter jaw
    and chin, finer brows, fuller lips, no beard or stubble, and a buzz cut
    where the dice gave a receding horseshoe.
  - Tests: big societies are 47–56% men; over 90% of pirate raiders are men
    and most pirate engineers are women; all seven tones for both sexes;
    every bust size turns up; the portrait matches the body and no woman is
    bearded; a bigger bust measures deeper.

- **The people are Quaternius' bodies now (2026-10-26).** Astra, looking at
  free character kits: *"let's do the quaternius models"*. The 3D people
  stand on Quaternius' Universal Base Characters (the two in the free
  Standard pack, a male and a female body) and move with his Universal
  Animation Library. Both are CC0 (`assets/quaternius/LICENSE.txt`).
  - **What stays:** every role's look. The helmet, pack, vest, harness,
    exo-frame, rifle, boots and the face kit are still built by
    `npcmodel.js` as before. They're lifted onto the new skeleton by
    `people.js`: head kit is fitted to the head, chest kit to the torso's
    width at each height, arm kit is swung out to the new body's T-pose,
    and leg kit follows its joint. The suit's paint (each role's markings and
    the ship's livery) is wrapped round the new body by matching texture
    coordinates part by part.
  - **Animation:** standing, talking, walking (timed to the stride, so feet
    land where they step), sitting at a station and talking while seated,
    and working. The clips blend as people start and stop. Each body takes
    the library's clips through a retarget pair a bone, since the bodies
    are proportioned differently from the clip rig.
  - **Who gets which body:** seeded by name and role, so a person is always
    the same body.
  - **Pipeline:** `tools/glb2people.cjs` reads the packs (.glb or .gltf),
    folds the 30 finger bones into the hands (23 bones left), resamples
    every clip at 30 fps and writes `src/people-data.js`. `src/rig.js`
    samples, blends and poses at runtime. `npcgl.js` draws a body (smooth,
    four weights a vertex) and its kit (flat, one bone a vertex) through
    one program.
  - **Fixed on the way:** torsos torn into shards in the game but not in
    previews. The deck position was folded into every bone matrix in single
    precision, and a chest vertex blending four bones landed in four
    slightly different places. A person is now posed about their own feet,
    and the place they stand is added once, in the draw. The pass also
    forces depth writes on.
  - **Not yet:** the old box figures are still built, since they hold the
    paint and kit the new bodies borrow and they're the fallback without a
    GPU. Hands are bare under the gloves' colour, not gloved shapes.

- **The overboss's tithe (2026-10-26).** Astra: *"in Syndicate controlled
  systems, paying a tithe to the overboss or whatever is a great way to show
  you're not Navy or Police."* Asked, she chose:
  - **Two places to pay it.** The overboss's collector hails you when you
    arrive in a Syndicate hold, and a fixer (or any Syndicate face) in the
    bar of one of their ports takes it too.
  - **Paying buys all of these:**
    - their patrols and their pirates leave you alone in that system;
    - a little standing with the Syndicate (+2);
    - their own doors (Syndicate-issue guns, hulls and livery, and anything
      on a Syndicate port's shelf) read you 15 points higher;
    - 5% better prices both ways at their ports.
  - **Refusing marks you SUSPECTED** of being Navy or Police in that system.
  - **The law doesn't care.** In her words: *"Even the lawful empires
    treat the Syndicate as better than pirates, but worse than civilians.
    It's well known that they tax travellers in their space, and the
    general advice is to pay the tithe and keep problems from following you
    back to your home port."* Paying touches no lawful faction's standing or
    record.

  How it works (`src/tithe.js`, new):

  - **The call.** On arrival in a hold the collector names his price; the
    log tells you to press F4 to answer. His channel (`$`) is at the top of
    the comms list, with three choices:
    - **Pay**;
    - **Haggle**: once per call, and it can go up as well as down. The
      roll is seeded by system and day, so reloading doesn't change it;
    - **Refuse**.
  - **Ignoring him** for 10 minutes counts as refusing.
  - **The price.** 150 cr, plus 120/300/800 for a medium, large or extra-large
    hull, plus 3% of what the hold is worth. A friend of the Syndicate pays
    as little as half; someone they dislike pays up to 1.6×.
  - **How long it lasts.** A tithe covers that one system for a week of
    game time. Come back after that and he calls again; inside the week, he
    tells you your mark is still good.
  - **Left alone** (`sim.js`):
    - their pirates and patrols that wake near a ship that has paid only
      shadow it;
    - a pirate that is already holding you up breaks off when you pay;
    - a Syndicate patrol about to inspect you waves you through.
  - **Suspected**, for a week:
    - a Syndicate patrol searches you at least 90% of the time;
    - it looks again every ten minutes it holds on you;
    - their pirates don't break off when a patrol is near.
  - **Clearing suspicion.** Paying late, at 1.25×, on the channel or across
    the bar.
  - **Better prices** apply to the market rows of a Syndicate port while
    you're paid up. The port's own book is unchanged.
  - **The fixer** remembers that you paid through them.
  - `test/tithe.test.js` (46 checks).

- **A way out of every ship: an airlock and a belly ramp (2026-10-26).**
  Astra: *"create a set of stairs/ramp which can be opened from both inside
  and outside the ship and which allows travel from inside to outside of
  the ship"*, *"ensure that all models have a pathway to the exterior which
  will seal against vacuum"*, and *"climb into them from the ramp, up and
  into a room which seals the ramp and then perpendicular to the ramp is
  another airlock door which opens into the main interior of the ship."*
  Asked: you suit up in the airlock on airless worlds; the inner door and
  the ramp are **never** open together; a belly ramp on every hull.
  - **The airlock** (`shipdeck.js`) is a sealed room off the port side of
    the passage. Its inner door (`lock`) is across the room from the ramp
    well, at right angles to the ramp. Its controls are on the outboard
    wall, and a lamp shows red while sealed and green while open to the
    outside.
  - **The cycle** (`airlock.js`, new): every trip in or out pumps for 5 s,
    and only once both ends are shut. The inner door is locked whenever the
    room isn't at the ship's pressure. Cycling out while landed lowers the
    ramp; docked, it opens the berth hatch instead. Cycling in raises the
    ramp first. Nothing out there in flight: the controls refuse.
  - **Three ways down**, picked by how far the deck is off the ground under
    her gear: a 30° ramp, a 42° stair where a ramp would be too long, or a
    lift platform (2.6 m) on the tall hulls (Sump, Tanker, Meridian,
    Leviathan, Heavy Tug, Crawler). Treads, rails and hazard edges; the
    ramp swings from its hinge in 4 s.
  - **Walking out.** Walk down the ramp (or ride the lift) and you are on
    the ground beside her. You can see her from outside on her gear, with
    the ramp down, standing on a ground patch tinted for the world. There's
    a post at the foot of the ramp that raises and lowers it from outside.
    Under a low belly you crouch (the Crawler's needs a crawl). Chart
    overlays are hidden while you're outside.
  - **From outside** the hull is cut open under the ramp well, with the
    well walls and the lit airlock above it.
  - `test/airlock.test.js` (24 checks): every hull's rooms fit inside her
    model; the door is perpendicular; the ramp foot reaches the ground; a
    flood-fill walk from the cockpit reaches open ground; the seal state
    machine never has both ends open.

- **ENGINE and WEAPONS pages on the cockpit MFDs (2026-10-26).** Astra:
  *"Ship interiors require MFD panels which show things like engine fuel,
  heat in weapons, number of missiles and their hard points, etc. use some
  kind of graphic to identify systems from one another."*
  - Every system has its own colour and glyph (`SYS_COLOR`, `SYS_GLYPH`),
    used on every page, so a system reads the same at a glance wherever it
    appears.
  - **ENGINE**: slipspace fuel, reaction mass, reactor load, and gravity
    against thrust.
  - **WEAPONS**:
    - a heat thermometer with ticks at 55% and 100%, beside a live column
      for the heat sinks;
    - each hardpoint as a box with its gun glyph turned to the muzzle side,
      its fire group, its heat per shot and its cycle bar;
    - missile racks as silhouettes, with an arrowhead on the armed rack;
    - a strip for sinks, shield and turret.
  - The panel list on the side screens shrinks its rows to fit (min 14 px).
    `G.dashPage(id)` switches a page for playtests.

- **Each role's suit in its portrait, and the face kit on the suited body
  (2026-10-26).** Astra: *"let's make a variant for each class type, since
  some of that would still be visible in person like that."* Asked which she
  meant, the suit in the portrait or the kit on the 3D figure, she said both.
  - **The portrait shows the suit that body wears.** The sitter is drawn a
    little smaller so the shoulders get room, and the collar and shoulders
    are that role's suit, in the same colours the body is built in
    (`NpcModel.suitOf`: a crew role takes the ship's outfit, a faction role
    its own):
    - pilot: harness straps crossing the chest, seal ring in the accent
      colour;
    - engineer: a reflective yoke, and a chest pocket with a pen;
    - gunner: a quilted vest under a steel flak collar;
    - security: a vest with the SECURITY strip, a shoulder radio, and an
      arm band;
    - tactical: a chest plate and dome pauldrons;
    - medic: white sleeves, a sash, and the green disc with its staff;
    - loadmaster: the exo-frame bar across the shoulders with hazard
      chevrons, and the radio mast with its light;
    - raider: the stolen navy pauldron, a patched sleeve, and stitched
      patches;
    - pirate captain: lapels, a red sash, the steel arm with rivets, and
      trophy plates stacked on one shoulder;
    - enforcer: a high collar and black lapels;
    - heavy: an armour plate, big pauldrons and a gold line;
    - fixer: a white shirt, a gold tie and the gold seal ring;
    - marine: a chest plate with white chevrons, square pauldrons with
      white trim, and the rig straps;
    - officer: a white placket, white epaulettes and gold pips.
  - **The kit shows on the 3D figure where a helmet wouldn't hide it.** It
    is the same roll as the portrait (`Portrait.gearOf`, which `npc.js`
    hands to `NpcModel.build`), fitted to each role's helmet (`HEAD_FIT`;
    the slab helmets of tactical, marine and heavy sit flatter):
    - an eyepiece: a lens glowing over one eye on the visor, with its
      housing on the shell;
    - a cyber-eye: a hard point of light behind the visor;
    - goggles: strapped round the outside of the helmet;
    - a rebreather: filter canisters and a grille at the chin;
    - a headset: a whip antenna with a red tip.
    Glasses, shades, an eyepatch, an earpiece, tattoos, piercings and face
    paint are all under the helmet, so only the portrait has them. A piece
    the role's helmet already carries isn't doubled: the gunner's eyepiece
    and ear cups, the raider's goggles, the captain's red eye.
  - Tests: kit is built onto the body and cached; hidden kit leaves the
    body bare; every role takes the kit; suits come in the right colours;
    the portrait and the body share one roll. Probe: `tools/probe-kit.js`.

- **Haircuts in the portraits (2026-10-26).** Astra: *"the hairstyles
  appear identical across all the faces."* The 3D body has six hairstyles,
  and under a helmet nobody sees them. The sketch had only been drawing those
  six, and four of them came out as the same cap-shaped mass. Now each face
  rolls a cut of its own, from the body's family:
  - short: crop, side part, fringe, quiff, curls, afro, undercut, top knot,
    widow's peak;
  - long: loose, waves, ponytail, bun, bob, braids, locs;
  - slick: slicked back, slick side part, undercut, widow's peak;
  - buzz: buzz, fade, cornrows;
  - bald: bald, horseshoe (more likely over 50);
  - mohawk: mohawk, spikes, a low curly hawk.
  - The cut is rolled in its own seeded stream (`'cut|'`), so the rest of
    every face stays exactly as it was. The table is `CUTS` in
    `src/portrait.js`.
  - **Any face, any cut (same day).** Astra: *"we aren't modelling hair on
    the 3D models for the NPCs anyways."* So the portrait no longer keeps to
    the body's family of hairstyles, and the list above is just the set of
    cuts. Every face draws from all 26 cuts by weight (`CUT_ODDS`). A role
    makes a few cuts more likely (`CUT_LEAN`):
    - raiders: hawks, about a quarter of them;
    - marines and tactical: buzz and fade;
    - officers: side parts and buns;
    - fixers: slicked back;
    - captains: long hair and locs.
    The old forced styles (every raider a mohawk, every fixer slicked) are
    gone. A pirate captain still has a beard. Past 54, a fifth of faces go
    bald or horseshoe. The horseshoe's side tufts are soft ovals now, not
    boxes.
  - The hair is drawn as locks (clumps of strokes) rather than evenly spaced
    lines, which had read as a knitted cap. It has a band of sheen and a
    soft hairline. The crown now sits above the skull: before, the skull's
    top showed as a pale band over short hair.
  - Hair that hangs behind the head (long, bob, ponytail, braids, locs,
    afro, bun) no longer tints the face with its colour wash.
  - `tools/portrait-sheet.html` names each portrait's cut in its caption.
  - Tests: a crowd of 300 has at least a dozen different cuts, and all 26
    turn up; raiders lean to hawks; a face keeps its cut; every cut has odds.

- **Colour in the portraits, and a randomiser for the kit people wear on
  their faces (2026-10-26).** Astra: *"colorize them somewhat and then give a
  script to randomize things like eyepieces, rebreathers, etc."*
  - The sketches keep their pencil, with a light wash of colour laid under
    it: skin and hair in the body's own colours, an iris colour, some warmth
    in the lips and cheeks, and the suit collar and shoulders in the
    livery's colour (teal-grey for civilians, navy blue, charcoal and gold
    for the Syndicate, rust for pirates).
  - Each face is rolled a kit from twelve pieces: eyepiece (a monocle HUD
    with an LED by the ear), cyber-eye, eyepatch, rebreather mask with side
    canisters, goggles pushed up on the brow, glasses, shades, earpiece and
    wire, headset with boom mic, piercings, a tattoo (neck barcode or cheek
    chevrons) and face paint. Each piece goes on the left or right side.
  - The odds are per role, in one table at the top of `src/portrait.js`
    (`GEAR`). Gunners mostly wear an eyepiece, raiders and captains go for
    cyber-eyes, patches, ink and metal, engineers and loadmasters wear
    goggles and rebreathers, and security wears an earpiece. A second
    table (`CLASH`) keeps pieces that can't share a face apart, such as a
    patch and glasses, or two things on the same eye.
  - It's seeded from the person, in its own stream, so a person always has
    the same kit and their face doesn't change.
  - `tools/portrait-sheet.html`: open it in a browser to see a sheet of
    portraits by role and livery, with a tally of the kit. Change the odds
    in `GEAR` and reload to see the spread.
  - Tests: the kit is the same every time; every piece turns up in a crowd
    of 400; no clashing pieces are worn together; and plenty of faces wear
    nothing.

- **Talking to people on foot (2026-10-25).** Astra: *"let's make sure we
  have some more complex dialogue trees for NPCs, based on a few rules which
  already exist for the comms traffic."* Asked, she chose all four of those
  rules, and that talk feeds the systems the game already has. E on anyone
  on a deck opens a conversation: their line over numbered replies (1–9 or
  click). Greyed replies say why they are not open to you. Esc, Goodbye or
  walking away ends it. They stop and face you while you talk, and the
  pointer is free until you walk on.
  - **Temper and values**, drawn with the same weights a captain's chair
    uses: port security leans lawful, nobody in a Syndicate jacket is an
    abolitionist.
  - **Their opinion of you** comes from the same rules a captain on the
    band uses (`Captains.judge`, split out of `opinion` for this). Station
    people know what their port has heard (`Rumours.tallyAt`). A docked
    ship's crew speak for their captain. Your own crew know your whole
    record, and whether they have been paid. A furious face offers only
    Goodbye.
  - **Memory, no repeats.** Each person remembers what passed between you
    (`G.people`, saved) and brings it up. They never open the same way twice
    running.
  - **Lies are checked.** "What is your business here?" is answered with
    the comms page's claims, checked against the real ship by
    `Messages.check`. Customs and marines always read your manifest, and
    lawful or principled port security can pull it. A caught lie goes in
    their memory and on your public record.
  - **What talk can do:**
    - Buy a round, once a day, which warms the bartender and loosens the
      talk: who in port can't stand whom, raiders on the lanes, and whether
      the officials can be bought.
    - Ask who is in port and how each captain feels about you.
    - Read the market off the clerk.
    - Ask the yard about your hull, and about new papers.
    - Haggle a hand down (once each). They sign on at the agreed fee and
      wage, through `wageMul`.
    - Pay a warrant at the customs desk.
    - Buy friends in a port from a fixer (`Combat.bribePort`).
    - Ask a docked crew about their captain, where they are bound, and
      whether she owes you (`Favours`).
    - Ask your own crew how the ship is (real numbers) and how they are
      holding up.
  - Fixed on the way: on foot, the icon bar added ten click targets every
    frame and nothing cleared them. The walk overlay now rebuilds the list
    each frame, as the cockpit does.
  - Tests: `test/dialogue.test.js` (new, in `npm test`). Probe:
    `tools/probe-dialogue.js`.

- **The Capital and the Carrier at their true size, flown from the conning
  tower (2026-10-25).** Astra: *"Let's fit the cockpits to the Carrier and
  Capital class ships to align with where the conning tower is on the
  model, and the rest of the ship should be visible since the tower has a
  360 degree window views."* At 25 m the Capital's observation gallery was
  33 cm tall, so asked, she chose **true size in the world**: the Capital
  is **250 m** and the Carrier **300 m**, everywhere — drawn, fought and
  berthed at that length. Every other hull is still 25 m.
  - **The bridge is in the tower.** Your seat and the bridge deck sit in
    the Capital's observation gallery (eye 37.9 m up, in its window band)
    and in the Carrier's island cab (20.5 m up, over the flight deck). The
    cockpit view, walking aboard, your crew at their stations and the rear
    view all use that position; the ship turns about her own centre as
    before.
  - **360° glass.** The bridge deck's side walls, the aft bulkhead either
    side of the door and the lift lobby are glazed. From the bridge you see
    the rest of her — decks, terraces, mast, turrets, the flight deck —
    with the gallery or cab you are standing in left out of the model so
    its walls do not block the view (its floor stays, just below the
    sill). Below the bridge the decks are closed rooms, as before.
  - **The tower's height.** The lift drops 41.5 m to the Capital's main
    deck and 35 m to the Carrier's, at 8 m/s (about five seconds). The
    first guesses were 14 m and 10 m.
  - **Docking:** a port needs a bay big enough for her real size. Nearly
    every yard and highport has one; where none fits, docking is refused as
    TOO BIG. A port without modelled bays still takes her.
  - **Outside:** the chase camera, its zoom limit, the exhaust, re-entry
    plasma and shield all scale with her length, and the guns fire from
    where they are on a 250 or 300 m hull.
  - NPC traffic is unchanged: the NPC capital class is still 520 m.
  - **Screens on the bridge deck (2026-10-25).** Astra: *"On that conning
    tower bridge should be MFD panels which are configurable, as with the
    smaller ships."* The helm's own screens were already there; now every
    crew station on the bridge deck carries a live MFD across its face, with
    the same pages as the helm's. F5 → PANELS gains a HELM / BRIDGE DECK
    switch on these two hulls: the bridge deck is laid out bow-up with each
    wall's stations, and ◀ ▶ arrows point to the wall each screen is on.
    Gunnery starts on NAV / TARGET, Engineering on SHIP. Like the helm's, the
    choices last for the session. The station screens are only drawn when
    you can see them: walking the bridge deck, or turned round in the seat.
  - Tests: `test/towers.test.js` (new, in `npm test`); `shipdeck.test.js`
    allows the tower's extra panes.

- **Decks, a lift and a tram on the big ships: conning towers (2026-10-25).**
  Astra (2026-10-24): *"for the Capital and Carrier ships, there's a conning
  tower, which means the Bridge is on the top of it, and an elevator must be
  used to traverse from that to the flight deck or other parts of the
  ship."* The flight deck is the Carrier's hangar; the stops are the
  bridge, the main deck and airlock, the hangar, and a junction from which
  engineering is reached; the XL hulls without a tower get decks and a lift
  too. Asked on 2026-10-25: the lift is a **real ride**, the hangar holds
  **your parked craft**, and the long way aft to engineering is a **tram**.
  - **Which hulls:** Capital, Carrier, Meridian, Leviathan, Crawler. The
    bridge stands above the main deck by the tower: Capital 14 m, Carrier
    10, Leviathan 8, Crawler 5, Meridian 4 (Capital and Carrier since
    measured off their models at true size: 41.5 m and 35 m, see above). Every other hull is one deck, as
    before.
  - **The decks** (shipdeck.js): the **bridge** (cockpit, stations, the
    bridge door, a lift lobby); the **main deck** (passage, quarters, medbay,
    turret if fitted, airlock and cargo bay — where you come aboard); the
    **junction** 3.2 m below it (a tram platform, a 30–38 m tramway, the far
    platform and the **engine room**, which moves down here from the
    passage on these hulls); and on the Carrier the **hangar**, a 22 × 40 ×
    9 m bay with three pads and its doors lit at the aft end. The bridge
    deck runs forward of the lift shaft and every other deck aft of it, so
    no deck is ever seen from another but through the lift.
  - **The lift:** one car in one shaft, a door on every deck. Inside, a
    button per other deck on the starboard wall, marked **▲** up or **▼**
    down; you press the one you are LOOKING at (walk.js now picks such
    things by gaze, not by nearest). The doors close, the car moves at
    3 m/s with you in it — the eye moves, the keys rest — and the doors
    open on the new deck. Each landing has a lit panel showing which deck
    it is.
  - **The tram:** E at the platform's edge and it carries you aft at up to
    8 m/s down the lit tube to engineering, and back.
  - **The hangar's craft:** the small ships of your fleet berthed at the
    same port stand on the pads, in their own models at full length.
  - **The crew** (npc.js): every job knows its deck. A hand whose next work
    is on another deck walks into the lift and is gone from yours; one whose
    work brings them to your deck steps out of it. On the bridge you see
    engineers leave for the engine room and come back.
  - Tests: shipdeck.test.js walks a decked ship by the lift and checks each
    deck from it, the buttons' arrows and that the one you look at is the
    one pressed, the deck heights, the hangar clearing the tramway; npc.test
    checks crew leaving and returning by lift. `tools/probe-decks.js`
    rides the whole route in the real game (57 fps on the RX 540).
  - **Not done:** NPC ships' interiors (boarding), crew riding the tram
    with you, and conning-tower glass on the bridge to match each hull's
    exterior art.

- **Gunners on the bridge: a knack each, for the forward guns and the
  seekers (2026-10-25).** Astra: *"gunners act as a stat boost on component
  heating and energy draw requirements or increased damage/probability of
  hit for the forward facing guns. They also increase missile targeting
  accuracy."* Asked how the "or" works, she chose **by the gunner**; asked
  whether the lower draw counts at the yard, **yes**; asked whether seekers
  may lose a lock so accuracy means something, **yes**.
  - **The knack** (crew.js `knackOf`): every gunner is a **cool hand** or a
    **marksman**, a pure function of who they are (no save field). The hall
    and the crew screen say which; so do they, if you talk to them.
  - **Who gives it** (crew.js `gunnery`): a fitted turret takes your best
    gunner (as it always has); the others sit at the bridge's gunnery
    consoles, and the best of each knack there counts. Scaled by rating —
    an exceptional hand gives the full amount, a green one a fifth.
  - **Cool hand:** forward guns put up to 30% less heat into the hull and
    draw up to 25% less power — on the yard's own count, so a good one lets
    you fit more gun than the reactor carries bare.
  - **Marksman:** up to 25% more damage, and an aiming cone up to 80% wider,
    so a shot a little off the nose still connects.
  - **Every gunner, either knack, guides the seekers:** see below.
  - **Over budget** (new): pay off the cool hand who was making the fit
    legal and the ship draws more than she makes. Nothing is taken off her;
    the forward guns share what there is and cycle slower in proportion
    (20% over, a fifth slower). Paying them off says so, the reactor line on
    the ship screen goes red, and a fight reminds you.
  - **Seekers can lose a lock** (combat.js `updateMissiles`). Until now a
    missile never missed but by running out of fuel, and the Bootleg's
    "gives up if the target turns hard" was a line in the catalogue only.
    A seeker now has a track rate (Hawk 0.05 rad/s, Bootleg 0.022): when the
    target slides across its view faster than that, it may slip off and
    coast. Inside 1.5 km it is committed. From 10 km a target crossing at
    0.2 km/s is hit by both every time; at 0.5 the Bootleg hits about one in
    ten; at 0.8 the Hawk about a third — and an exceptional gunner aboard
    takes those to about 80% and 100%. "Seeker lost lock" when it happens.
  - **The turret room follows the turret.** No stock hull carries one, so
    the dome-per-gunner room from earlier today put every gunner in the
    wrong place: the turret position now appears when a turret is fitted
    (one seat, the gunner it takes), and the rest work from the bridge.
  - Tests: `test/gunnery.test.js` (22 checks: knacks, who gives what, heat,
    damage, the cone, the yard's count, over-budget cycling, seekers with
    and without a gunner, Bootleg vs Hawk), added to `npm test`.

- **The rest of the ship: engine room, turret, medbay, cargo bay, and a
  second seat on some small ships (2026-10-25).** Astra: *"S ships aren't
  all one seaters. Some have crew positions for a second pilot or gunner.
  M ships should have a small medbay, while S ships have medical supplies
  in the cockpit."* Asked which and how, she chose: the Wren and the Bollard
  get a co-pilot's seat beside yours, the Lance a gunner's console behind
  you, the Talon stays one seat; and the second seat is optional — nobody
  has to be hired to fly her, whoever you sign on sits there.
  - **M and up** (shipdeck.js): off the passage to starboard, a medbay (one
    bed on an M, two from L, a vitals screen over each and a cabinet, lit
    in white and green — no cross, it is a protected emblem) and an engine
    room (the drive trunk down the outboard wall with glowing inspection
    bands in the ship's colours, the drive console on the aft wall). To
    port, aft of the quarters, a turret: a seat per gunner (up to three),
    each under a glass dome let into the ceiling that the sky shows through
    like any window. Aft of the airlock, through a third sliding door, a
    cargo bay with crates stacked down both walls and a manifest terminal.
    The passage grows to fit both walls.
  - **S**: medical supplies on the bulkhead beside the door, and the second
    seat on the Wren, Bollard and Lance.
  - **The crew use them** (npc.js): gunners on watch sit under the turret
    domes (a bridge gunnery station only when the domes are full);
    engineers' rounds go to the drive console, now and then the cargo bay;
    off watch a hand sometimes looks into the medbay. On an S ship there are
    no watches — your hand is in the second seat, and a co-pilot takes the
    helm the moment you get up. A hand of any trade takes a free second seat.
  - **E** on the new things says what they are: the co-pilot's seat and the
    turret say who sits there, the manifest says how full the hold is.
  - **Fixed on the way:** a pilot taking the helm was planted behind the
    seat's backrest instead of on it; and the crew stopped to give way to
    you while you were sitting in the pilot's seat, which held a co-pilot
    at the door of a two-seat cockpit.
  - Tests: shipdeck.test.js and npc.test.js check every hull's rooms by
    size, that every room and everything labelled in it can be walked to
    from the airlock, the turret seats per gunner, and the crew in them.
    `tools/probe-rooms.js` photographs them in the real game.
Since 1.1.0-beta "Abby". Not yet a release: nothing here is pushed until
Astra has seen it working.

### Added

- **2026-10-25: the Shared_AI line merged (ship interiors and people).**
  Seven commits from Driftwood's branch, ending at "Walk your own ship,
  and people on it", carried onto this line in a trial branch first. Its
  own entries follow this line's under each heading below. Where the two
  had built the same thing twice:
  - **Captains.** The NPC captains in their ships keep `captains.js`. The
    stories under the title menu moved to `captain-stories.js`
    (`CaptainStories`), with their own test.
  - **Lift rides, both kinds.** The ring's car under its heavy bay rides
    on the restored car-and-lift legs (board, lift, pad, transfer, the car
    drawn under you). A lift inside the hull (`route.ride`) is still driven
    to, waited on, ridden and left (`routePhases`), now on the transfer leg
    rather than one long enter leg. The ring's platform is no longer also
    lifted out as a mover, so it is drawn once.
  - **Moving parts after a split.** The converter's car and hatch faces are
    numbered against the whole hull; lifting movers or a city out of it
    moved every number after them, so the ring's car collided as most of
    the station. The split hull now remembers where each face came from
    (`oi`), and the converter re-reads the runs after clipping bores.
  - **survey.test.js** flies over a world that turns. Twilight worlds can
    be tidally locked now, and the first rock it used to pick is one.
  - **The cutaway.** This line's cone, cut greebles, ground-port section
    and cutaway styles are kept over the older band-and-quiet-zone shader.
    Faction paint and the slipspace tear are carried in the same shader.
  - **Docking.** Both lines had fixed the dock edge; one edge
    (`justDocked`) hands on to the contracts, the torpedo berth scan and
    the save.
  - **Arrival.** A pad is never taken as the home station: the Shared
    line's fallback to "any station" is what had put a pad with no orbit
    under spawnShip.
- **2026-10-25: survey instruments graded, carried over.** The 21 October
  commit (grade 1 scanner, grade 2 gamma spectrometer, grade 3 deep array;
  its own entry is below) was only in the older copy on C:; it is on this
  line now.
- **2026-10-25: deposits are somewhere, and a polar orbit is one key.**
  Astra: "we need easier controls to put the ship into a polar orbit for
  mapping mineral deposits. planets should have mineral deposits which are
  location-based, where you might find metals/precious metals in some
  ratio in one place, water where there's water on the surface, fissiles
  show up with the gamma spectrometer, and so on."
  - **Y on the F2 orbit map plans a polar survey orbit.** It finds the
    next time you cross the world's equator (its spin equator, the one the
    survey maps in) and puts one node there: the burn that leaves you
    circular at that height, running pole to pole, the cheaper way round.
    It is an ordinary node, so the planner shows the new orbit, the burn
    and the reaction mass before anything fires, and \ flies it. It warns
    if the orbit would be too high for the survey (three radii). Flown by
    the autopilot from an inclined low orbit (a 10.4 km/s, nine-minute burn):
    0.4° off polar, e 0.013.
  - **Every world has a ground map.** One grade per survey cell, per
    commodity. A world's grade is now its best ground; most of it is
    poorer (75% of all ground is under half its world's grade).
    - Metals come in two to five provinces. Each has its own mix: some are
      nearly all base metal, some carry a good share of precious metal, and
      where you find the precious metal you find ore with it. Ore bodies
      stand on land where a world has seas.
    - Fissiles are one to three small hotspots, which only the gamma
      spectrometer shows.
    - Water is where the picture shows it: under the seas and in the ice
      caps you can see from orbit, a little in the ground elsewhere. Lava is
      not water. An ice world is ice all over. A tidally locked world's ice
      is its night side. Worlds with no visible water have buried ice, in
      patches toward the poles.
    - A surface mining port stands on its world's ore body (94 of 94).
  - **The SURVEY page's map shows it.** Each mapped cell is the colour of
    the most valuable thing your instruments have read there (ore rust,
    precious gold, fissile green, water blue, hydrogen violet), brighter
    where it is richer. The list's swatches are the key. The ground under
    you is boxed, with a BELOW YOU line saying what is there. The grades
    in the list are the best ground you have seen so far.
  - **A drone digs the ground it stands on**, at that ground's grade, and
    says so when it is poor.
  - Seas and caps are worked out on the CPU by the shader's own arithmetic.
    The terrain table moved from gl.js to weather.js so both read one copy.
    The survey and the picture agree on every coastline sampled.
  - Fixed on the way: landing on a tidally locked world worked out the
    landing spot without undoing the pole's lean (`az`), so the ship was
    put back on the ground somewhere else the next frame.
  - `test/ground.test.js` (20 checks), `test/polar.test.js` (15).
- **2026-10-25: the burn autopilot warps through long burns.** Astra said
  yes to it: the polar plane change is a seven-to-nine-minute burn, and the
  autopilot used to hold every burn at 1x.
  - At ignition the clock goes up as far as leaves at least forty frames
    of burn, and comes down a notch at a time as the burn runs out, so the
    last of it is flown at 1x. You can take it lower yourself; the
    autopilot only ever brings it down.
  - What the engine delivered is now booked after each step, on the clock
    the integrator actually ran (the physics clamp and the impact net can
    both shorten a step), not guessed before it.
  - In the render suite's flown test: the polar burn finishes in a small
    fraction of the frames it took at 1x, and ends within 2° of polar.

- **2026-10-15: Driftwood's line merged into Abby.** Planetary rings,
  asteroid belts and Trojans, the lift car, lightning, the glass-glow
  option, cockpit greebles, faction names and the rescue fix now sit on
  Syndicate Crawler's cutaway-and-glow release.
- **2026-10-16: the 11 October test copy merged.** Station shuttles and
  drones, the ground-port section cut, the cutaway style option and the
  stand lift.
- **2026-10-16: lifts are ridden.** Lift cars, platforms and ramp cars are
  moving surfaces with collision. A ship waits for the lift, boards, rides
  the shaft at lift speed and drives off (39 station models route through
  a lift ride).
- **2026-10-16: mining, rung 1: survey.** A Survey scanner (6,400 cr,
  grades) and a Deep survey array (23,500 cr, tonnages) map a world's
  deposits from orbit along the real ground track: a polar orbit maps the
  world, an equatorial one a band. Rings map with their planet's equator,
  belts field by field. Deposits are seed data and agree with the industry
  already there. Surveys are dated, halve in value every 180 days, and sell
  once to the Mining Guild at any desk. New SURVEY dashboard page.
- **2026-10-16: mining, rung 2: claims, drones and landing.** File a claim
  (1,200 cr a year, once a quarter of the world is mapped), buy up to two
  mining drones (9,500 cr), set them down, and land on open ground to
  collect what they dug. Lawless worlds strip unattended drones. N deploys
  and collects, Shift+N recovers.
- **2026-10-16: mining, rung 3: the mining laser and gas skimming.** The
  Mining laser (4,800 cr) cuts ore chunks off rocks in a belt or ring
  (about 11 s a chunk); scoop them. Rich rocks give ore, poor ones slag. A
  Gas skimmer (7,800 cr) takes hydrogen from a giant's upper atmosphere,
  more the deeper you dare against the heat.
- **2026-10-16: R lifts off.** On the ground, R thrusts up and lifts you
  off; F thrusts down. Only R lifts off.
- **2026-10-16: rock torpedoes.** A small nuclear charge on a slow, dumb
  missile that breaks 6 to 14 chunks off an asteroid. Mining Guild
  torpedoes (2,500 cr) are sold only at mining ports; Syndicate ones
  (1,600 cr, grey) at outlaw ports or where corruption runs high.
  - **Out, never in.** Scanned inbound to a port with one aboard is an
    offence: 2,600 cr fine a torpedo, and they are seized. A Syndicate
    torpedo is seized whichever way you are going.
  - **Safing refund.** Detonate one for safety (well clear of any port) and
    the Guild pays back half its price, unless the blast was a successful
    mining shot that earned more than the torpedo cost.
  - **Sabotage.** A torpedo that goes off close to a station damages it:
    the port refuses docking for a while, and if you are caught the bounty
    is 30,000 cr and the owner's standing falls by 40.
- **2026-10-16: the ordnance panel.** Torpedoes do not launch from the
  missile key. F5 > ORDNANCE: pick a charge, lift the striped guard (C),
  then LAUNCH (Enter). The guard drops again after each launch and
  whenever you leave the tab. The panel shows the nose readout, what the
  torpedo will hit and how far the nearest station is.
- **2026-10-16: the torpedo command link.** Every torpedo in flight is
  listed on the panel with DISARM and DETONATE (D / X for the newest).
  A disarmed torpedo becomes an inert canister you can scoop back into
  the rack; the panel warns in red when you are inside the blast.

- **2026-10-17: mining, rung 4: your own skimmers.** A ship in your fleet
  with a pilot and a Gas skimmer can be put to work on a giant from the
  Fleet tab (F5, docked): she flies out, skims, comes home to the port she
  is clamped at and sells the load there, and goes back out, until you
  recall her. Or **keep aboard**: one run, and the hydrogen comes home in
  her hold (for stockpiling toward a station of your own).
  - She skims the safe way, a pass an orbit, so a run takes hours: a better
    pilot, a heat shield and an ice giant rather than a gas giant all make
    it shorter. About 1,500–2,500 cr a game day for one ship at a giant her
    port orbits; a giant across the system is honestly not worth it, and
    the row says so.
  - Every load is sold at the price on the day she brings it in, and her
    sales push that port's hydrogen price down like yours do.
  - Recall finishes the run she is on. A pilot who walks over unpaid wages
    brings her home first. Her tanks refill free alongside, as yours do.
  - She is real traffic: drawn in the giant's upper air while she skims,
    on the scope and the channel, and hailable.
  - Drone collection by your own ships was left out on purpose: having to
    land is what keeps a drone below active work. That job goes to an
    outpost on your claim in rung 5.

- **2026-10-18: the mining beam takes real pieces off a rock.** The mining
  laser cuts continuously, and every 2 t it cuts comes off as a piece to
  scoop: about 5 s on ice, 8 s on stone, 13 s on metal. Rocks weigh what
  their size and material say (a 5 m ice chunk is about 470 t), every
  piece comes off that mass, and it is carved out of the rock where the
  beam was: a crater in the rock's own surface that turns with it,
  deepening while you hold the beam on one face, with fresh paler rock
  showing in the cut. A rock shrinks as it loses mass and is gone when it
  runs out. Small ring chunks can be cut away in a session; big rocks scar.
  Torpedoes take their chunks off the same mass. The CUTTING bar shows
  tonnes toward the next piece. Saved.
- **2026-10-19: the shroud suite, silent running, and the chains that end
  with it.** Astra: a quiet jammer should be hard to come by, at the end of
  its own quest line, because a sabotage run means getting in and out
  without being detected or identified. The loud ECM stays in the yards;
  the **shroud suite** is sold nowhere. **SHIFT+X** runs silent:
  transponder dark and radiators shut. Ships notice you only inside 200 km
  (instead of 3,000). Crimes you commit are reported as an unidentified
  hull with no bounty, and so are thefts from other prospectors' drones and
  a torpedo sabotage. The price is heat: the hull sheds nothing and the
  suite runs warm, so cover lasts about two minutes before the heat limit,
  and then the battle shield and hull pay. Firing anything or burning past
  half throttle breaks cover for five seconds; the auto-turret holds its
  fire; it cannot run with the ECM on. A panel under the crosshair shows
  SILENT RUNNING or why cover is broken, with the heat. You earn the suite
  from either side: once the first chain is done (The Powder Chain or The
  Long Arrangement), the same dock offers a five-chapter sequel - **The
  Grey Ledger** for the navy's intelligence people, **Blackout** for the
  Syndicate. Its chapters are infiltration runs (reach a hostile system and
  dock without being searched; a search blows the run and breaks the
  chain), recovering the prototype from a wreck, burning a contact (two
  contracts on your board - deliver him, or let him run for less pay and a
  hit to your standing; whichever you settle first is your answer), and a
  first sabotage (hole a named port with a rock torpedo; it settles the
  moment the torpedo lands, and done silent it carries no name). The last
  chapter fits the suite, or holds it at the yard if no slot is free.
- **2026-10-19: jamming is loud.** Astra: ECM lights you up like a
  Christmas tree, just not with an ID code, which is suspicious enough.
  With the jammer on, ships notice you from three times as far (pirates
  and police alike come for you from 9,000 km instead of 3,000), a police
  patrol that has already inspected you comes back for another look, every
  customs scan searches your hold, and a lawful patrol that watches you
  jam from within 1,000 km for 20 seconds cites you for it (250 cr on your
  bounty, once per patrol). The INCOMING panel reads ECM ON - LOUD, NO ID.
- **2026-10-18: countermeasures against missiles.** Four, and each beats
  a seeker a different way. A **decoy launcher** (utility, 2,600 cr, rack
  of 12 charges at 60 cr each from any yard): **O** fires one aft, and each
  seeker coming for you rolls against it - far likelier when it is close to
  impact, so the last moment is the moment. **Radioactives as a flare**
  (Astra's idea): jettison a tonne or more of waste or fissiles with
  seekers inbound and it is a very hot, oxygen-free flare, much better than
  a charge and burning longer; dumping waste is still the crime it was.
  **Point defence**: the auto-turret shoots at a seeker inside 3 km before
  anything else, and a hit kills it. An **ECM jammer** (internal, 6,800
  cr): **SHIFT+O** switches it; while on, every seeker within 12 km has a
  steady chance each second of losing lock, and it puts heat in the hull.
  A lured seeker chases the decoy and, when that burns out, flies on blind
  until its fuel is gone. Police and navy carry six decoys a hull and drop
  one at your missile when it is 4 km out; traders and pirates carry none.
  With seekers inbound, a flashing INCOMING panel under the crosshair gives
  the count, the nearest range, your decoys and the ECM state, with a red
  marker on the nearest one or an arrow to it.
- **2026-10-18: past the heat shield, the battle shield; and the law has
  bite.** Skimming is an elliptical pass nose-first through the top of a
  giant's air: deeper fills faster, but below a certain depth the heat
  shield cannot shed the friction. Heat over the limit now burns the
  battle shield before it touches the hull - fast (a full shield lasts
  about fifteen seconds at the worst), but long enough to pull the nose up
  and raise the periapsis - and it does not recharge while it burns. The
  RAM SCOOP panel has a second row: the altitude the heat shield holds
  above at your speed, where you are, and your periapsis, coloured when
  you or your periapsis are below the line. A warning says when the
  battle shield starts burning. Separately, police were no threat to a
  fleeing starter ship (their gun did 4.5 a second at best and could not
  break a 40-point shield). Lawful police now carry a heavier gun (10 a
  second, 16 km, steadier against a runner) and three missiles each for a
  fugitive, fired from up to 30 km when you are running or your shield is
  up, one every 18 seconds, with a MISSILE LAUNCH warning. A police
  missile takes most of a full shield; it is slower than a Hawk and burns
  out after 40 seconds, so running early from far out escapes it and
  running late from close in does not. Docking or landing is cover.
- **2026-10-18: the gas skimmer is a ram scoop.** Astra: skimming means
  going into the atmosphere face first, the scoop collecting gas as a ram
  scoop. The intake's mouth is now on the nose: what it takes is density x
  speed x its area x how squarely the nose meets the oncoming air (full
  take nose-first, half at 60 degrees off, nothing side-on beyond 80
  degrees or tail-first). In the air with it fitted, a RAM SCOOP panel
  above the crosshair shows how square you are and the tonnes a minute,
  green when you are on the line; off it, a ringed marker shows where the
  nose should go, or an arrow to it when it is out of view, labelled NOSE
  HERE. Your fleet's skimmers are unchanged (their pilots fly it right).
- **2026-10-18: resource wars, stage 1 (the model and the map).** The
  empires now go to war over ore. Each system has a workable reserve of
  cheap ore that its industry draws down on the clock (the surveyed
  tonnage is the whole crust and is unchanged); scarcity is felt within a
  game year. An empire's chaos is the share of its systems where the law
  has been bought or the Syndicate holds, and scarcity pushes more of them
  over the line. When scarcity times chaos gets high enough, the empire
  declares on a rival's richest reachable border system; the war runs two
  to six months, the stronger and less chaotic side usually wins, and a
  win moves the system to the winner. First wars come in years two to
  three, from the empire with the most chaos, on all three test seeds.
  Corruption you leave behind counts, but it fades in weeks, so only
  crime kept up moves a war. It is all seed and clock: the same seed and
  the same player give the same wars. Seen on the galaxy map: contested
  systems carry a red cross, taken ones a ring in the new owner's colour,
  the destination readout says who is attacking or who took it, and a
  news line under the chart header gives the fronts, the last war, or how
  much of their cheap ore the empires have worked. Fixed on the same
  page: a long atmosphere description no longer runs over the planet
  names in the destination's world list.
- **2026-10-18: a fence in every system.** About one system in six had
  no back room outside a Guild hall, so stolen goods meant a jump. Each of
  those now has one, at its least developed market that is not the
  Guild's; every other port, and every back room that was already there,
  is unchanged, and so are the seed fingerprints. A Syndicate hold still
  pays more (85% against 60%). Holding hot goods, the refusal at a market
  and the message when you take them name the back room in this system.
- **2026-10-18: other prospectors, and stealing from them.** Other
  outfits now have claims and drones on about one world in eight, in
  nearly every system with a port: Ibarra Ore Co., Halloran & Daughters
  and so on, one to three drones a claim. They are worked out from the
  seed, so they are the same every time and no existing world, port or
  fingerprint changed. Each owner comes round to empty their drones every
  few weeks. Lock a world and get within a few radii: their drones are
  marked on the ground in orange (yours in green), with an arrow to the
  nearest when it is off screen, and the SURVEY page names who has claimed
  it. Land beside one: **N** empties its hopper into your hold and
  **SHIFT+N** pries the drone itself loose into your racks (empty it
  first). What you take is **hot**: a customs scan seizes the hot tonnes
  and any stolen drone and fines you (a corrupt inspector can still be
  paid off; an outlaw one does not care), Guild halls and ordinary
  markets will not buy it, and a fence (a black market that is not a
  Guild hall) pays 60% of the price, 85% in a Syndicate hold. A fence
  also buys a stolen drone (3,800 cr; 5,225 cr in a Syndicate hold), or
  set it down on your own claim and it is yours. Lawful traders will not
  take hot ore ship to ship; Syndicate hulls will. The owner reports the
  theft when they next come round, a few days to weeks later, wherever
  you are by then: a bounty of 900 cr plus half of what you took, with
  their flag. Saved.
- **2026-10-18: laser ships in rings.** A fleet ship with a pilot and a
  mining laser (or the cannon) can be put to work in a ring from the Fleet
  tab, beside the skimming rows: out to the ring, cut and scoop until the
  hold is full, home to sell, and round again until recalled; or keep the
  load aboard for one run. What costs her time is chasing and scooping the
  pieces, which a better pilot does faster, and she keeps less of what she
  cuts than you would. She only cuts for what her home port buys, and the
  load is the ring's own mix (water, ores, rare metals by how icy the ring
  is), sold commodity by commodity and drawn off the ring's survey store.
  Measured across twelve rings: a median of about 1,400 cr a game day for
  a steady pilot. The rows are sorted by what they pay a day.
- **2026-10-18: the mining laser cannon** (6,200 cr, hardpoint). A pulse
  that knocks a piece off the face every shot, from 5 km, with 3 s between
  shots. Against ships it is fully absorbed by a shield that is up, even by
  the shot that empties it; a bare hull takes it like a pulse laser. While
  it cools, its mount on the hull glows red, three capacitors on the
  cockpit dash glow and fade, and a CAPACITORS bar under the crosshair
  counts down.
- **2026-10-19: `tools/chop-modules.cjs`, station modules cut from the
  existing art.** Reads every port in `ref/ports` and every ship in
  `update_models`, gathers their named parts into functional assemblies
  (dock, habitat, command, storage, power, comms, propulsion, industry,
  defence, structure, hull, access), and writes each as its own `.glb`
  with a catalog (`modules.json`): kind, size, parts, colours, the models
  it came from, and **sockets** — the places where it was joined to a
  different assembly in its parent model, which is where the next module
  bolts on. Trim (decals, lamps, glass, greebles) goes with the nearest
  assembly; terrain, interiors, gear and stands are left out; the greeble
  kit is skipped. 171 models give 2,851 distinct modules in about 1,335
  forms (the same form in another paint, size or pose counts once), with a
  contact sheet (`index.html`, hover to turn). Output goes to
  `Claude outputs/modules`; nothing in `src/` changes. Groundwork for ports
  that grow and for cracked ports rebuilt over years.
  Same day, second pass: **modules carry their berth routes.** Each berth's
  route in from `src/ports.js` is turned back into the model's frame and
  clipped to the module that holds the berth; where it crosses the module's
  wall is the module's real doorway, and the piece inside is its own route.
  Berths reached straight from space are marked as having their own outer
  door. A module that other berths' routes run through is marked
  **pass-through**, with each way on and the biggest ship that fits it
  (Astra: outer doors become the doors into the next add-on, so these are
  the pieces that can sit in the middle of a chain). 407 berths: 259
  routed, 148 with their own door; 169 pass-through modules, 30 of them
  wide enough for large ships. A module that holds a berth counts as a dock
  whatever its parts are named. The contact sheet draws routes, doors and
  ways on, and has a filter box ("pass" shows the pass-throughs).
- **2026-10-20: ports that grow — the plan, not yet drawn.** Designed with
  Astra over 19–20 October; nothing in the running game changes yet (the
  three new `src/` files are not loaded by `index.html`).
  - `tools/growth-points.cjs` → `src/growth-points.js`: where each of the
    96 port models can grow. Points on its known berth routes with a
    straight neck out through the wall, points over outer doors (an add-on
    there turns the door inward and must be a pass-through), and hull
    points for add-ons with no berth. Each carries the biggest ship its
    route takes and the open ROOM measured around it, and each model
    carries its own symmetry, read off the mesh. About two minutes for all
    96, from data already in `src/ports`; no converter run.
  - The same function runs on every chopped module, so **every piece has
    growth points of its own** (Astra: "growth points should exist for all
    station types ... so that custom stations can be built"): a station
    grows from the free points of everything in it.
  - `tools/module-index.cjs` → `src/modules.js`: the chopped modules as
    the game needs them, one per form and paint, in game axes and metres,
    with the family each was cut from (1,739 modules). Ship pieces are
    scaled to the game's 25 m hull.
  - `src/growth.js`: each port's building history from twelve years before
    the game to forty after, seed + clock like the wars, cached. ORDER
    (wealth and law, less for a Syndicate hold, less for the corruption you
    leave) picks who builds each piece: the PORTBUILDERS' UNION (mirrored
    sets, the core's own family of pieces, a Crawler on site, never cut
    loose), MOONLIGHTERS (pairs with gaps, short chains), or SCAVENGERS
    (single pieces welded onto pieces, ship parts and mismatched paint, cut
    loose again after some years: a wreckhold). Chains stop at three pieces
    unless a large hub carries them on; no piece is bigger than what it
    hangs on; nothing standing overlaps. About half of each port's growth
    is already there when the game starts, the rest arrives over fifteen
    years. A Crawler stopped on its way (`Growth.delay`) pushes its job and
    every later one back.
  - `test/growth.test.js` (19 checks).
  - **2026-10-21, second pass.** The Union now builds **big, and from the
    station's own family**: it takes a piece of its own family before
    another family's piece of the asked-for kind (a rich spine had been
    growing refinery tanks and cradle bins, because a spine has no storage
    piece worth the name), and of what fits it takes the largest (anything
    within 60% of the biggest). On a rich `spine-l` that is spine habitats,
    docks and access trunks of 76–139 m, where it was 48–60 m bins. Union
    sets go **along the station's main axis**: a long station (a spine)
    grows lengthwise and a flat one along its axle; a point facing out off
    either end is three times as likely to be built on, a point with no
    mirror mate a third as likely, every member of a set stands at the same
    station along the axis (within 4% of the half-span), and the Union no
    longer builds half a set — if a mirror is free and the piece will not
    stand there, it tries another. **Necks**: each piece on a berth route
    carries its neck (`slot.neck`: from the route point out through the
    wall to the piece), and the paper draws them as corridors, 30 m for
    S/M routes, 60 m for L. `test/growth.test.js`: 26 checks.
    Same day, third pass: **necks off pieces too.** `tools/module-index.cjs`
    now keeps where each module route point's neck starts (1,760 of them;
    `src/modules.js` regenerated; every other value is unchanged), so a
    piece welded onto another piece's route gets a neck back into that
    piece. **The Union varies its blocks**: a form it has already built at
    a port is a third as likely next time (then a fifth...), and when only
    one or two big forms fit it reaches down in size until it has three to
    choose from. A rich spine builds 5–9 forms where it could build one;
    pad sites and farms stay narrow, because their families have few
    pieces that fit a flat ground site. 29 checks.
  - **2026-10-24: a way in from the primary L berth.** (Astra: "ensure that
    all constructed stations have a path for ships to enter from the
    primary L size berth and be taken through to their docking bay
    somewhere inside the stations".) Before this, nothing tied an add-on
    dock to the station's routes: a dock whose bays open to space stood on
    its base with its neck into a blank wall, and across every port model
    3,506 of 23,438 grown pieces stood in front of a primary L berth's
    mouth. Now:
    - The **primary** entrance is the L berth most of the core's routes
      come in through (berthL0 on a spine, berthLFwd on a cylinder; a
      ground site's busiest entrance). `Growth.wayIn(model)`.
    - `tools/module-index.cjs` keeps each module's **way in**: `in` (the
      biggest ship its doorway takes), `jd` (where the doorway is) and
      `ob` (bays open only to space). A dock whose bays all open through
      one face, mouths within 60 m, is **turned in** (`ti`): that outer
      door faces the station and becomes its doorway (Astra, 10-19:
      "outer doors can then become the doors ... of the NEXT add-on"). A
      pass-through with no bay joins by one of its ways on, door to door,
      instead of standing on its base. `src/modules.js` regenerated.
    - `src/growth.js`: every free point carries **reach**, the biggest
      class that gets there from the primary, inside: a core route that
      comes in through the primary, then the route points and ways on of
      pieces that are reached through their doorways. A dock is built only
      where it is reached by a ship its size, and only if it has no bay open
      straight to space. A piece is set so its **doorway** lands on the
      neck. Nothing stands in a **lane** in front of any mouth that opens to
      space (45 m either side, 1.5 half-spans out), and nothing is built
      over the primary's mouth (yard models had three points there).
    - Cost, every model × rich/middling/poor × 4 seeds: 4,265 docks where
      there were 5,079 (L: 160 of 226), every one reached; Union docks
      577 of 975. Docks reached only through a second L entrance (cradle
      Beta, some refinery and yard routes) are no longer grown.
    - `test/growth.test.js` "the way in", worked out from the port data
      and not from growth.js's bookkeeping: every grown bay reached, its
      class fits the whole way, the primary's approach clear and its mouth
      not built over. 33 checks. `Claude outputs/path-sweep.cjs` runs the
      same over all 96 models; `path-builders.cjs` counts docks by builder.
      The paper (`growth-paper.cjs`) draws the primary's way in as a cyan
      arrow and its kept-clear approach dashed.
  - **2026-10-24, later: a station is built out in a year or two, not
    decades.** (Astra: "I don't think it'd take literal decades to finish
    one of these things" — "I meant the whole station".) Growth had run
    from twelve years before the game to fifteen after, a piece a year,
    each 5–16 months on site. Now each port has ONE **build-out**: the
    Union finishes a station in 0.7–1.3 years, moonlighters in 1.2–2.2,
    scavengers in 1.5–3 (`Growth.BUILDOUT_Y`). On site a Union piece takes
    1–3 weeks, a moonlighter's 3–9, a scavenger's 1–10 (`PIECE_DAYS`; a
    Crawler's tugs unpack an L piece in hours, the rest is fitting out),
    and a Crawler is there 5 days before and 3 after. When a port's
    build-out falls is its own, between twelve years before the game and
    four years in: over every model × 3 orders × 4 seeds, about two in
    three are finished when you arrive, one in ten is building on day
    one, a quarter begin in your first four years. After it a station is
    finished; only where order has really fallen to scavengers do they keep
    welding on and cutting loose, about every ten months (a wreckhold is
    never finished). `test/growth.test.js` "time": the longest build-out
    3.0 years, no Union or moonlighter piece after one, a Union piece at
    most three weeks; 37 checks. The paper shows each port early in its
    build-out, halfway and finished, not game years 0/5/15.
    `Claude outputs/growth-timeline.cjs` prints the timings per order.
- **2026-10-24: no-man's land — 450 stars, and most of them nobody's.**
  Astra: "not every star system has anything in it but hydrogen for fuel
  to keep moving at the star or one of the planets, by increasing the
  number of stars to 450 and creating a kind of no-man's land in between
  polities; this makes every game have its own expansion into new
  territory which can inter-relate with faction missions." Decided with
  her: a bigger disc at the same spacing, about 45% claimed, the Syndicate
  both inside the empires and out in the frontier, and (later stages)
  both the polities and the player expanding into it.
  - **The galaxy** (`src/galaxy.js`): 450 stars on a 72.75 ly disc (was
    200 on 48.5), the same density, so a hop is the hop it always was. No
    star is left more than 8.8 ly from its nearest neighbour (the rim had
    one at 10.7, past a laden Mule's 9.7). Each empire claims the compact
    region round its capital, an even share of 45% of the stars, and never
    a star within 4 ly of another empire's: there is always open space
    between them. The first capital stands within 10 ly of home, so a
    career always begins inside a polity; the others stand out at 0.8 of
    the disc's reach at evenly spaced bearings - opposite each other when
    there are three - so the open space lies between every pair
    (farthest-point sampling had put both rim empires on one flank of
    kawartha, leaving half the map a single empty frontier). The
    Syndicate's three holds and
    the three minor powers are carved out of claimed space as before (their
    shares now of claimed space), and the Syndicate also keeps two
    **frontier outposts** of four systems out in no-man's land, with no
    empire round them. On kawartha: 212 of 450 claimed, 238 nobody's.
  - **Empty systems** (`src/generate.js`, `opts.empty`): a star nobody holds
    generates its star, worlds, moons, rings and belts exactly as it would
    (every stream is forked, nothing moves) and then no ports: no market,
    no traffic, no patrols, no flag, no law (`government: unclaimed`,
    `crimeScore` 100, as deep space), `sys.empty`. A bare seed never
    generates empty. `Galaxy.systemOpts` is the one call the game's system
    cache, the chart's preview and the wars' summary all use. Courier and
    passage contracts and the arcs' courier, infiltration and recovery
    steps only go to stars somebody holds; a hailed ship's charting says
    "nobody holds it".
  - **Star skimming** (`src/sim.js`, `src/mining.js`): every star has a
    CORONA out to three of its radii that the ram scoop works in - density
    x speed x area x facing, as for a giant, densest deepest. No drag (an
    orbit through it is the orbit it was), and RADIANT heat, inverse square
    of distance and fourth power of temperature: a red dwarf can be skimmed
    deep on a bare hull, a sun-like star wants a heat shield deep, a hot
    white one cooks even a shielded hull at half depth. About 1.7 t/min at
    the top, 5.5 halfway, 20-55 deep. **Skimmed hydrogen fills the jump
    tank first, then the hold** - at a giant as well as a star - so a ship
    can keep moving through systems with no port. 87 of 714 empty systems
    in three galaxies have no giant at all; the star is their fuel.
  - Arriving where the busiest port is a pad no longer parks you under the
    pad (main.js `enterSystem` wanted an orbital station; a latent bug the
    new map walked into).
  - **Saves: epoch 3.** A career from before this is in a galaxy that no
    longer exists, so it does not load (the DEPRECATED shelf was empty).
  - Tests: `galaxy.test.js` "no-man's land" (empty systems really empty and
    with the worlds they would have had, home claimed, about 45% claimed,
    the empires apart, frontier outposts) and the territory checks rewritten
    for claimed space, 96 checks; `mining.test.js` "the star" (skimming,
    tank before hold, heat by star class, every star has a corona), 106;
    `render.test.js` "an empty system" (arrive, every screen F1-F8, both
    views), 967. The slipspace tear-out test and the jump's clock check
    leaned on the old map's first lane (empty, long); they now take the
    longest lane and accept a live corridor's own crossing time.
    `Claude outputs`: `empty-smoke.cjs`, `corona-check.cjs`,
    `galaxy-map.cjs` (the map top down, held and nobody's).
  - **2026-10-24, later: you choose when the hold fills the tank.** (Astra:
    "fuel that you have in the hold as like hydrogen can be used to refuel
    the ship so you skim and then choose to refuel from inside the ship
    menu or ship screen".) The tanks-first skimming above is undone:
    skimmed hydrogen goes into the HOLD, at a star or a giant, as it did.
    `Mining.refuelFromHold` pumps hold hydrogen into the jump tank, as much
    as the tank has room for, never the tonnes held under contract; on F5
    SHIP the hydrogen row has a **TO TANKS** button, and **Enter** on that
    row does the same. (It was F for an hour; F is the down thrusters, and
    a screen that is up must never take a flight key - Astra.) "Skimmer:
    hold full" says how. The render harness now loads mining.js,
    as index.html always has (without it the pump found no Mining). Tests:
    mining 110 (into the hold not the tank, the pump fills to the brim and
    no further, contract hydrogen stays), render 970 (in an empty system,
    F5 shows TO TANKS, F still reaches the thrusters from that screen,
    Enter on the hydrogen row fills the tank).
  - **Next** (agreed, not built): the empires and the player expanding into
    no-man's land on the clock - Crawlers founding ports there, dated like
    the wars - and the faction missions that hang off it.

- **People: your crew at their stations, a station deck with people on it,
  and the crews of the ships in port (2026-10-25).** Astra: *"We should use
  these crew models on ships and stations in game, in the first person
  mode. They should also be on NPC ships. Give them each a basic AI script
  so they do their assigned jobs by class."* The models are the ones she
  designed on the turntable page ("Manifest Crew Roster") on 2026-10-24/25.
  - **The bodies** (`src/npcmodel.js`). Fourteen roles: pilot, engineer,
    gunner, security, tactical, medic and loadmaster for a ship's crew;
    raider and captain for pirates; enforcer, heavy and fixer for the
    Syndicate; marine and officer for the Navy.
    - Low-poly in the first Unreal Tournament's manner, 700 to 2,400
      triangles each, with the detail painted on one 512 × 512 skin per
      person rather than modelled.
    - A ship's crew wears its livery: none on a civilian ship, Navy blue
      and white, Syndicate charcoal and gold (an engineer's hard hat always
      yellow or red), or a pirate crew's mismatched patches.
    - Everything carried is attached: the loadmaster's antenna to a
      bracket on the frame, rifles to two-point slings over the shoulder,
      the smart optics to the helmet by a cable. Exo-frames hinge at
      elbows and knees, and every body has ankles.
    - Rifles are built from one datum, the chamber, and check six rules
      of how a gas carbine works (ejection port over the magazine well,
      trigger behind it, buffer tube in line with the bore, and the rest).
    - Each body is skinned on eleven bones, so posing one costs eleven
      matrices and no rebuild.
  - **Drawn on the GPU** (`src/npcgl.js`): one draw call per person,
    depth-tested against the room they stand in, lit like the cockpit
    room. `gl.js` gains `GLWorld.addPass`, run after the cockpit room and
    before the screens. Without WebGL2 the nearest few people go into
    walk.js's painter's sort as flat triangles coloured off their skins.
  - **Who is where, and what they do** (`src/npc.js`):
    - **Your crew** are the people on your roster. On watch (eight-hour
      watches on the game clock, two of every three) engineers and gunners
      sit at the bridge-deck stations of their own role, one to a seat; a
      second hand for a one-station role stands at the shoulder of whoever
      has it. An engineer now and then walks aft to look over the passage
      and the lock. Off watch, people sleep in their bunks or work at the
      galley. A pilot takes the helm whenever you get out of the seat, and
      gets up when you want it back; with you in the seat, the pilot on
      watch stands at your shoulder.
    - **A station deck** has a market clerk, a yard clerk where there is a
      yard, a bartender and a crew-hall steward at their counters;
      security in the port's colours (the Syndicate's enforcers and a heavy
      at the big lock in their ports, marines at the big lock and a customs
      officer where the Navy keeps a garrison, the port's own officers
      elsewhere); the hands in the crew hall, who are exactly the people
      `Crew.forHire` lists for that port and week, less anyone you have
      already signed on; and now and then a
      Syndicate face in the bar, more often where the port is bought.
    - **Other ships' crews.** Every ship moored at the port
      (`Sim.berthOccupants`) sends its people, in its owner's colours: one
      works her berth, the rest go between the bar and the concourse.
      `Npc.crewForShip` is the same crew for any NPC ship wherever she is
      met, ready for boarding.
    - People walk room to room through the doors only, round counters,
      wait at a sliding door until it opens (and hold it open:
      `ShipDeck.updateDoors` takes their `hold`), and stop short of you
      for a moment rather than walk through you.
    - **E talks to whoever you are facing**: their name, what they are,
      and a line in character. A hand for hire says how good they are.
  - **The station deck is drawn on the GPU** when it is available
    (`Walk.meshFor`): the same plates the 2D deck painted, as one mesh in
    the docked ship's frame, so the people on it are depth-tested against
    its walls. The 2D deck is unchanged without WebGL2.
  - Tests: `test/npc.test.js` (28 checks). Seen in game on the Crawler
    (`tools/probe-npc.js`, RX 540): a Dart's bridge deck from the seat and
    on foot, her quarters, and a station's spine, concourse, bar and crew
    hall with 23 people about; the concourse held 57 fps.

- **A modelled cockpit for every ship, a sliding door aft, and a walk to
  your airlock (2026-10-24).** Astra: *"We need to have a modeled interior
  for every ship that doesn't have one, specifically the cockpit. There
  needs to be doors that slide into the structure of the ship to open the
  way from the cockpit into the rest of the ship, and the syndicate ships
  need to have the dark grey and red motif on the interior too."* Her
  answers: a real 3D room per hull on the GPU; the door walkable to your
  airlock; Syndicate colours on the Corsair Runner, Enforcer, Syndicate
  Heavy and a Crawler in Syndicate livery. See `claude/ship-interiors.md`.
  - **The cockpit is a room now.** Every hull's bridge is a GPU mesh
    fitted to that hull's own glass and size (`src/shipdeck.js`, from
    `Render.cockpitGeometry`):
    - windscreen, quarter-lights and side windows each set in a wall;
    - the floor window at the bottom of a footwell under the dash slot;
    - side consoles, the overhead, a ceiling with light strips, and the
      rear bulkhead.
    It used to be one flat-painted room for all 23 hulls. The modelled
    cockpits inside the GLB files were never drawn and still are not.
  - **The windows keep exactly their shapes.** Each pane is drawn first,
    depth only, and the room after it. A wall behind glass fails the depth
    test and the world already drawn shows through. Tests show no wall
    stands between the seat and any window, on any hull, and every window
    is set in a wall with no sky past its edge.
  - **The door.** Two leaves in the rear bulkhead slide sideways into the
    wall to open, with a lit trim round the frame and a hazard stripe where
    they meet. Each opens as you reach it and closes behind you.
  - **Walking.** O, berthed or on a pad, stands you up behind the seat
    (it used to drop you on the station deck).
    - You walk aft through the bridge door, down a passage (longer on
      bigger ships: 2.4 m on an S hull to 8 m on an XL), through a second
      sliding door into the airlock.
    - The hatch's lamp is green when there is somewhere to step out to.
      E at the hatch, berthed, steps you out at your berth on the station
      deck. On the station deck, E at your own hatch brings you aboard at
      the airlock. E at the seat sits you down.
    - Walking uses the seat view's projection from a standing eye, so the
      room, the screens and the world through the glass all line up.
      From the passage the cockpit is seen only through the doorway.
      There is no flight HUD on foot.
  - **The Syndicate's interior.** Dark grey walls, floor, consoles and
    leaves; red door trim, stripes and hazard edges; red-and-amber switch
    panels on grey plate; a red accent strip on the dash. All taken from
    the hull art's own `syn*` and `syndicate_*` materials. On the Runner,
    Enforcer and Syndicate Heavy, and on any Crawler in their livery.
    Navy hulls (Cutter, Capital, Carrier) get a cooler grey with pale-blue
    trim.
- **Bridges with crew stations, and crew quarters (2026-10-24).** Astra:
  *"M and L size ships might have multiple crew stations on the bridge"*,
  *"create them so that they match the geometry of the ship, but with
  multiple crew stations"*, and *"All ships which have crew stations
  require crew quarters."* No crew-station models exist in the art (every
  hull file has only the pilot's seat), so the stations are built in code.
  - **The bridge deck.** On every M, L and XL hull, the bulkhead behind
    the helm stays where it was, with its rear screens and greebles. Its
    doorway is now an open arch onto a bridge deck behind it, with the
    sliding bridge door at the deck's aft end.
  - **The stations.** One for each hand the hull needs with you at the
    helm (`Crew.crewNeeded`): engineering (amber screens) and gunnery (red).
    Each is a console against the side wall with a seat facing it, down
    both walls on a wide hull and the port wall on a narrow one. Up to six;
    a Carrier's nine share them, gunnery included. E at a station says
    who signed on for it, or that nobody has. Seeing crew at them comes
    with the NPC work.
  - **Crew quarters.** On every ship with stations, off the port side of
    the passage behind a sliding door that runs into the wall:
    - a bunk for every hand and one for you, in two-high stacks with
      reading lamps and end boards;
    - lockers, and a galley across the aft end, after the navy yards'
      crew rooms.
    The passage is lengthened to fit them.
  - S hulls (Talon, Wren, Bollard, Lance) stay one-seat, with no deck and
    no quarters.
  - The Carrier's and Capital's conning-tower bridges and elevators are
    the next slice. For now they get a large bridge deck like the others.
  - *Tests:* `test/shipdeck.test.js` +14 checks (49):
    - stations and bunks per hull;
    - every room on every hull can be walked to;
    - the helm's bulkhead has not moved;
    - the quarters door is wall while shut and its leaves go into the wall.
  - `test/tear.test.js` now runs in `npm test`.
- **A Crawler in a faction's colours (2026-10-24).** Astra: *"Player
  crawlers can have syndicate livery if they're operating for the
  Syndicate."* Her answer: you choose it when you commission or repaint,
  and the same goes for a navy.
  - The order sheet for a Crawler has a LIVERY line: civilian, navy or
    Syndicate.
  - The FLEET tab offers a repaint of the Crawler under your hands
    (4,000 cr).
  - Syndicate colours need a yard the Syndicate holds and 40+ standing
    with them (an Enforcer's line), and they must not want you. A navy's
    need its own yard and 40+ standing (ALLIED, a Cutter's line).
  - She wears that livery's model outside (`crawler_syndicate`,
    `crawler_navy`) and its room inside, until she is repainted.
    `Combat.liveryRefusal`, `Combat.repaintLivery`.

- **Choking a port by buying her cargo in flight (2026-10-21).** Astra:
  *"buying cargo off a ship means it doesn't have that cargo for the
  destination. Provides a way to choke a station without killing trade
  ships."*
  - When you buy a line off a trader, the port she was bound for gets
    that much less of it when she arrives. The deal says so: "*Port* will
    be N t short."
  - Nothing changes at the port before she gets there. When she docks,
    the shelf is short by what she no longer carries, and the gap fades
    the way a delivery would (the same decay as the inbound arrivals).
  - Buying the same line off more ships deepens the shortage. Other ports
    are untouched.
  - Shortages are saved with the trade book and forgotten once they have
    faded (`Economy.shortfalls`, `ShipTrade.shortDelivery`,
    `ShipTrade.attach`). 9 new checks in `test/shiptrade.test.js`.
- **The police leave Syndicate runners alone (2026-10-21).** Astra:
  *"Syndicate runners don't get chased by cops unless they are firing on a
  civilian vessel as the aggressor. The syndicate pays off the police."*
  This already held in the game. Police never scan, hail or chase a
  runner, and no NPC fires on another NPC yet, so a runner can never be
  the aggressor. The rule is now written into `buildRunners`
  (generate.js), so whoever adds NPC-on-NPC fire knows what it must
  respect.

- **The Crawler: the first bay of a station, and the crates it carries
  (2026-10-20).** Astra, over the day:
  - *"This is the new station-constructor, called the Crawler. There's only
    one size."*
  - *"crawlers be the frame for L size bays, so they become the first bay in
    a station, and carry the station's components, for if it's to be a
    skimmer or a shipyard. To get the XL sized shipyards, we stitch two
    crawlers together."*
  - *"6 to a cube for S modules and 4 for M modules, 2 for L modules and 1
    for XL modules which are station component crates."*
  - On freight: *"we have dedicated cargo haulers for that, right? I want to
    see both in game."*

  Her answers: a Crawler that becomes a station is **permanent**; every
  player-buildable station type comes from a Crawler plus the right crates;
  Crawlers can **chain**, more than two. This is the first slice. Founding
  and stitching come next (`claude/crawler-and-station-modules.md`).
  - **The Crawler is the station's first L bay**, so there is no separate
    core module. You can only order crates once you have a Crawler
    (flying, in your fleet, or on the slip). That is your "L first" rule.
  - **The models.** Your three liveries are in the hull library, imported
    as the bare frame. The originals are kept in `ref/crawler-src/`. No
    other hull changed.
  - **Her 24 cubes, drawn as what they hold:**
    - her own container when it holds freight;
    - yellow station crates (navy and Syndicate in their own colours);
    - nothing when empty.
    A full Crawler rebuilt this way is exactly your model, face for face.
  - **Packing.** A cube holds 6 S, 4 M, 2 L or 1 XL crates, one size per
    cube. Any cube without crates is 25 t of freight, so an empty Crawler
    has a 600 t hold. That is less than a Leviathan, so the haulers stay
    the better freighters. The hold shrinks as crates take cubes.
  - **The hull.** XL, built to order at a shipyard (8 days),
    450,000 cr, needs a crew, never sold ready-built.
  - **Crates, on the yard's MODULES tab.** Paid when ordered, built with
    build time, and waiting at that yard when done.
    - XL: slipway.
    - L: skimmer rig, refinery line, ore works, market hall, hab ring.
    - M: warehouse, repair dock, reactor pile, crew quarters.
    - S: berth clamp, defence battery, comms relay, fuel cell.
    In a Crawler at the yard, click a crate to crane it aboard (▶) or lift
    it off. The tab shows her cubes as crates / freight / empty. Crates
    aboard are lost with her, and you must lift them off before you trade
    her in or step into another ship. **The catalogue and prices are my
    pick.**
  - **Crates cost about what a mid-tier ship does** (Astra: *"modules are
    like the price of mid tier ships each, so building out a large size
    station is an expensive, but often worthwhile goal"*):
    - S: 60–75k;
    - M: 80–110k;
    - L: 120–165k;
    - the XL slipway: 200k.

    A Crawler plus a slipway, two L, four M and six S comes to about
    1.7 million.
  - **Her bay door and her small-craft bay** (Astra: *"it's on the bottom
    of the crawler and I'm building the model for us now. It will also have
    a docking bay L size for two tugs and one shuttle, for bringing shit
    from orbit down to the surface for surface ports."*):
    - a garage-style door on her **underside**, one leaf sliding up behind
      the other, usable only once a station is being built;
    - her own **M craft bay with three S slots**. Her craft ferry crates
      from orbit down to surface ports. A **tug is always required**,
      because only tugs have grab arms to move parts out of the crates in
      orbit. A bigger (M) shuttle takes two slots. That gives three
      loadouts:
      - standard: 2 tugs + 1 shuttle;
      - orbital push: 3 tugs, faster in orbit;
      - planetary push: 1 tug + the M shuttle, faster on the surface.
    The door and the bay's geometry wait on Astra's re-exported model.
  - **Her craft bay, in the rules (2026-10-20).** Astra: *"More tugs speed
    up the work, giving buying them a purpose at all."*
    - Every Crawler comes with the standard bay. At a shipyard, the
      MODULES tab offers a ▶ refit to each of the other loadouts. New craft
      cost full price; departing craft come back at seven tenths (standard
      → orbital push is 31,400 cr). Her crew flies them.
    - Claude's first rates: a tug unpacks 1.5 cubes a day in orbit; a Wren
      shuttle ferries 1 cube a day down to a surface site, the heavy
      shuttle 2.5. The tab shows how many days this load would take in
      orbit and on a surface with each bay. With no tug it can't build;
      with no shuttle it can't reach a surface.
    - The bay is saved, follows her into the fleet and back, and is lost
      with her.
    - **Her bay only ever carries her tugs and shuttles** (Astra: *"that
      way we don't have custom-ship-won't-fit problems later."*). No
      player ship, fleet hull or future modular ship docks in it.
      `Construction.bayTakes` is the one check.
    - **The M tug** (Astra: *"there's also an M size tug in the models we
      currently have, and one of those unloads it a higher speed, but not
      double."*). The Heavy tug (art: tug-m) unpacks 2.25 cubes a day,
      half again an S tug, and costs 66,000 cr.
    - **The pads decide what fits** (Astra chose this from her re-exported
      model). The bay has two S pads by the door and one M pad further in.
      An S pad takes an S craft; the M pad takes one M craft or one S
      craft. This replaced "three S slots, an M craft takes two". The
      loadouts, with their refit price from standard:

      | loadout | craft | orbit | surface | refit |
      | :-- | :-- | --: | --: | --: |
      | Standard | 2 tugs + Wren | 3.0 | 1.0 | — |
      | Orbital push | 3 tugs | 4.5 | — | 31,400 |
      | Planetary push | 2 tugs + heavy shuttle | 3.0 | 2.5 | 47,400 |
      | Heavy tug | tug + Wren + heavy tug | 3.75 | 1.0 | 35,200 |
      | Heavy orbital | 2 tugs + heavy tug | 5.25 | — | 53,400 |

      Rates are cubes a day; "—" means it can't supply a surface site.
  - **What a load founds (2026-10-20), the agreed bill of crates:**
    - market: market + warehouse;
    - refinery: refinery + warehouse;
    - skimmer: skim rig + refinery;
    - mining: ore works + warehouse;
    - passenger hab: hab ring + two berths;
    - shipyard: slipway + repair;
    - XL shipyard: slipway + repair, two Crawlers stitched.
    Every one also needs Crew quarters. The MODULES tab shows ✓ for each
    type her load can found, or what it still needs. Founding itself,
    where she becomes the first L bay, is the next slice.
  - **Astra's re-exported Crawler is in (2026-10-20)**
    (`new models/20-10-2026/crawler_allLiveries_14of24.glb`, kept as
    `ref/crawler-src/crawler_allLiveries_14of24.glb`):
    - She's 478 m long now (was 454), 153 m wide, 204 m tall.
    - The one file holds all three liveries. It is split into
      `ref/glb/crawler_{civilian,navy,syndicate}.glb`, each with its cargo
      detached, and `src/hulls.js` is regenerated (57 models).
    - The generator's own state rode along in the file's extras: all 24
      cubes and every part as Three.js JSON, 7.5 MB of the 9.5 MB. It is
      stripped on import.
    - The file draws 14 of the 24 cubes. All 24 centres were re-measured
      from the generator's cube list, so the game still draws every cube
      by what it holds.
    - New in the model, not yet working in the game:
      - the L berth in her belly, with its pad and two bottom leaves;
      - the stern craft bay, with its roll-up door and pads `padS0`,
        `padS1` and `padM`;
      - 12 tug grab points along her flanks.
    - Fixed in passing: the "frame carries no containers" test was a face
      count, which every re-export broke. It now looks for geometry inside
      a cube's volume.
  - **Saves:** crates and what is in her cubes are saved. Older careers
    load with none.
  - Also: a commissioned hull now leaves the yard with a registration (it
    had none).

- **The model drop folder moved (2026-10-20).**
  - `update_models/` now lives at `new models/update_models/`, all 76
    files. Git had been showing them as deleted; the move is now recorded
    as one.
  - **Nothing in the game read that folder.** The game reads the converted
    libraries in `src/` (`hulls.js`, `ports/`), which are built from
    `ref/`.
  - The one thing that did read it, `tools/stage-update-models.ps1` (it
    files a drop into `ref/`), now defaults to the new place and takes
    `-Source` for any other.
  - Checked with `-WhatIf`: it plans 71 models from the new location.

- **On foot in a station (2026-10-20), first slice.** Astra: *"full first
  person walking. We do need to model station interiors to walk in. We
  also want to be able to talk to NPC characters who are also on site."*
  - **O**, while docked, stands you up out of the seat into your berth.
  - Moving: **WASD** to walk, **Shift** to run, drag or the arrow keys to
    look.
  - **E** uses what you face:
    - your own hatch takes you back to the cockpit;
    - another of your ships berthed here makes you take command of her,
      and the ship you walked off stays on her clamp;
    - the market desk, the shipyard counter and the crew hall board open
      their screens. The F-keys still work too (Astra: keep both).
  - **The station is code-built from the seed** (Astra: code-built now,
    her generator's modules later), so a port is the same building every
    visit. `src/walk.js` builds it:
    - the L docking port and its double doors;
    - a spine corridor, with berths off both sides that get smaller the
      further they are from the L port, as Astra laid stations out;
    - a concourse with the bar, the market desk and the yard counter;
    - the crew hall.
  - Rooms are boxes. **The doors are the only way between rooms**, and
    you slide along walls.
  - Each of your ships in port gets a berth of her own size, with a lit
    hatch.
  - The world keeps running while you walk. Flight keys are held away from
    the ship, so U on foot does not launch her.
  - Not yet: the people. The bar says it is quiet for now. NPCs and talking
    to them, the Syndicate contact, and the shuttle's docking tube come
    next (`claude/walking-stations.md`).
  - Tests: `test/walk.test.js` (26 checks: same plan every visit, every
    room reachable from your berth, walls stop you and doors don't, berths
    descend in size, a hatch for every ship of yours). Checked in the real
    shell by `tools/probe-walk.js`: step out, walk, board the other ship.

- **Every ship in the sky can be flown, built and bought (2026-10-20).**
  Astra: *"I want any other non-buyable non-flyable ship type updated with
  a cockpit, a model name and a cost to build, to buy and what the default
  outfitting is"*, with *"Build = bare, Buy = outfitted"*, and *"the
  number of crew required to operate each one without the player flying
  it."*
  - **Eight new hulls**, all Claude's first numbers:

    | hull | size | model | build | buy | crew* | sold |
    | :-- | :-- | :-- | --: | --: | :-: | :-- |
    | Hawser Heavy Tug | M | tug-m | 66,000 | 73,110 | 2 | floor |
    | Heron Heavy Shuttle | M | shuttle-m | 60,000 | 76,290 | 2 | floor |
    | Tallyman Trader | M | trader-m | 72,000 | 85,680 | 2 | floor |
    | Corsair Runner | M | runner-m | 68,000 | 70,800 | 3 | floor where corruption ≥ 60 |
    | Syndicate Enforcer | M | enforcer-m | 110,000 | 121,970 | 3 | Syndicate ports, standing 40 |
    | Syndicate Heavy | M | enforcer_heavy-m | 175,000 | 192,550 | 3 | Syndicate ports, standing 70 |
    | Lance Fighter | S | fighter-s | 48,000 | 51,060 | 1 | built for navy allies (40) |
    | Fleet Carrier | XL | carrier-l | 18,000,000 | 18,112,140 | 10 | built for navy at 85; 30 days |

    \*Crew is what she takes with nobody else flying her; one fewer with
    you at the helm.
  - The Hawser and Heron are the Crawler's bay craft, now flyable, at the
    same prices. The carrier is the slow, mobile station Astra described
    (*"pretty slowly because the inertia of carrying a whole fleet's worth
    of shit takes a while to change"*): a capital's thrust on four times
    the mass.
  - **Build = bare, buy = outfitted, for every hull.** Each hull now has a
    default outfit (`HULL_STOCK`, combat.js); its gear is in the floor
    price at nine tenths.
    - Off the floor, your own gear still moves across, and the outfit
      fills whatever slots are left.
    - A large hull off a floor now carries that outfit, not a random fit
      from the dock's shelf.
    - Every shipyard builds every hull to order, bare, in 1 day (S),
      2 (M), 3 (L), 8 (XL), 14 (a capital) or 30 (a carrier).
    - The yard card shows build, buy and crew on one line, and floor rows
      name what she comes with.
  - **Crew per hull** (`Crew.crewNeeded`):
    - a pilot, unless you fly her;
    - engineers: none on S, 1 on M, 2 on L, 3 on XL plus 1 per 1,000 t;
    - a gunner per two guns beyond the forward pair the pilot fires on
      S and M (every gun on L and XL), two per capital mount, and one per
      turret.
  - **Cockpits:** every new hull has its own bridge. The Bollard and the
    Hawser draw their grab arms from the seat: two booms along the lower
    corners of the windscreen, caution-striped forearms angling in, and
    open jaws ahead (`render.js drawGrabArms`). The jaws stay open until
    there is a player tow for them to close on.
  - Grey and Syndicate hulls pass the same gates as the grey and
    Syndicate-issue guns (`Combat.hullGate`).
  - Note: the Sump waste hauler also wears tug-m, so it and the Hawser
    share a silhouette.
  - Tests: shipyard (outfits fit, prices, a cockpit and a model for every
    hull, gates), crew (hands per hull), construction (craft are real
    hulls). The combat suite's fitting tests now start from a bare hull
    (`buyBare`).

- **A ship built to order takes time to build (2026-10-19).** Astra:
  *"Build time for a ship is realistic, and lets you anticipate the use
  of your new ship even if you get blown up in your current one."*
  - *Commission, don't buy.* At a shipyard the BUILT TO ORDER list now
    shows each hull's time on the slip, and the card's one button is
    **COMMISSION — price · READY IN n DAYS**. You pay in full when you
    sign. You keep flying the ship you came in, so there is no trade-in
    at the desk, and the order sheet offers only the yard's shelf (your
    own gear stays on the ship you are in).
  - *Build time:* 3 days for a large hull, 8 for an extra-large one, 14
    for a Capital Ship. My pick; say if you want them longer or shorter.
  - *The order is yours, not the hull's.* It is saved, and a death does
    not touch it. A pilot blown up in the old ship wakes in a Talon with
    the new one still on the slip.
  - *Hand-over.* When she is done she is delivered at that yard as one
    of your fleet, tanks full, fitted, named and painted to the sheet.
    The yard calls you wherever you are, and her first week on the clamp
    is paid. The slip shows on the HULLS tab at that yard and on FLEET
    everywhere, with a countdown.
  - *Take command.* On FLEET, any ship of yours on the clamp you are
    docked at has two new rows. **▶ TAKE COMMAND · keep the …** leaves
    the ship you were in here as one of yours, with her hold and the
    contracts riding in it. **▶ TAKE COMMAND · trade in the …** sells
    her to the yard at seven tenths, gear and all, and your hold and
    people come across with you. Not for a partner's ship, one under
    way, or while a lien is outstanding. Unpaid berthing on her is
    settled first.
  - *The floor is still the floor.* A large civilian hull that happens
    to be standing on a yard's floor is sold as she sits and flown out
    today, as at any other dock. Warships and XL hulls are only ever
    commissioned.
  - Cancelling an order is not offered. Say if you want it, perhaps with
    a forfeit.

- **Cruise drives come in classes (2026-10-19).** Astra: "class two costs
  about 10 times as much as a class one, class three costs 10 times more
  again, or you can switch to the milfuel drives ... some ships have a
  second drive slot ... milfuel drives travel at five times the speed of
  normal drives." With her, each class doubles the speed, milfuel's ×5 is
  on top of the class, and a heavier ship is slower on the same drive.
  - **Top cruise speed:** 250c × class (1, 2, 4) × milfuel (×5 while slugs
    last) × a second drive (1 + half its ratio to the first) × √(146 t ÷
    the ship's mass now). A laden Talon on its Class 1 makes 250c; empty,
    about 340c. The mass lock still governs anywhere near a body.
  - **The drives:**

    | Drive | Price | Gates |
    |---|---|---|
    | Class 1 | 4,000 cr | standard on every hull |
    | Class 2 | 40,000 cr | development 0.45 |
    | Class 3 | 400,000 cr | development 0.70, standing 10 |
    | Military, each class | 2.5× its class | the Chernobyl's gates: development 0.80, standing 40 |

    A military drive burns milfuel slugs (0.45 t and 0.28 t of waste per
    20 AU) instead of reaction mass. With no slugs aboard it runs as an
    ordinary drive of its class.
  - **The drive slot:** a new slot type, `drive`. L and XL hulls have two,
    everything else one. It is never empty: every hull leaves the yard with
    a Class 1, every save is given one on load, and the last drive cannot
    be sold. Buying into a full bay trades in the weakest drive at the usual
    45%. The yard row shows the top speed before and after, the trade-in
    and the net price. Drives carry no mass and no power yet.
  - New suite `test/cruisedrive.test.js` (20 checks).

- **The sky at cruise speed: the old streaks, blurred, behind the planets,
  with a TNG red-blue shift (2026-10-19).** Astra: "I liked the old cruise
  animation a bit better, just, we need a bit of planets covering the lines
  and blur them a bit so we get a streak and not just a point or a line",
  and the TNG-remaster starfield "where right as you pass a point of light
  it rapidly shifts in color."
  - **The streaks:** each star streaks back toward where it was. That
    makes them radial about the heading when looking ahead, longest
    abeam, and swinging with a turn.
  - **How they're drawn:** by the world layer as soft gaussian quads that
    fade along the tail, so planets cover them.
  - **The colour:** stars ahead are washed blue-white and brighter, stars
    behind red and dimmer. The flip happens within ±6° of abeam.
  - **What sets the strength:** wash and streak length ride one log-scale
    number from 0.02c to 2000c.
  - **What went:** the 2026-10-17 relativistic aberration and black rear
    sky. The edge darkening is back.
  - `test/cruisesky.test.js` was rewritten for the new rule (22 checks).

- **Slipspace transit is a rift (2026-10-19).** Astra chose it from three.
  - **Going in:** a red tear opens on the nose in the real sky and gapes
    until it swallows the view.
  - **Inside:** dark wine and violet, with ragged walls. Filaments come at
    you blue-violet and flip red as they pass, the same rule as the
    cruise sky.
  - **Coming out:** a blue rift grows at the far end, gapes, and flashes
    you out onto the real sky under a fading blue wash.
  - **Corridors:** in a slipspace corridor, the exit rift tracks corridor
    progress.

- **Fresh wakes show the tear (2026-10-19).** Astra asked whether other
  ships leave "a red exit cloud of distorted space, like a rip in the
  fabric of the universe."
  - **The tear:** they did leave a cloud, but no visible rip. Now a wake's
    rift stays open in the middle of its cloud for its first 15 minutes,
    closing: red for a departure, blue for an arrival.
  - **From deep in a well:** seen from low over a world (full on the
    ground, none three radii up), a departure wake is deeper red and
    larger, and an arrival violet. This is a deliberate exaggeration;
    strictly, light falling into a well arrives blueshifted.
  - **How often:** measured across 800 samples, about 1.7 wakes per system
    at any moment, half of them departures, and about one departure a day
    per system.
  - **Tears and clouds linger for hours, and decay (2026-10-20).** Astra
    wanted them to last "hours, not minutes", and to "slowly fade and
    shrink over the time it does show in system; almost like radioactive
    decay".
    - *The decay:* `Slip.wakeDecay` gives a wake a 6-hour half-life over
      its 16-hour life. It is shifted so it lands on exactly zero at 16
      hours instead of popping out. That is about 65% at 3 hours, 28% at
      8 and 11% at 12.
    - *What decays:* the cloud's drawn brightness (`glow`), its size (the
      hole closes to a quarter of its torn width) and the rift in its
      middle all follow that one curve. The rift used to vanish after 15
      minutes; it is now open for the wake's whole life.
    - *What doesn't:* scan fidelity still reads the old `strength`, so
      nothing in the wake-hunting balance moves.

- **Tears bend light, boil and throw lightning (2026-10-21).** Built
  from a mockup Astra signed off ("wake glow and stuff are great. Let's
  implement them, arrival and departure, and then we should work those
  clouds into what we see as we reach our slipspace destination"). On
  the world layer a wake is now drawn by gl.js; the old 2D cloud stays
  as the fallback for machines without it.
  - **Lensing:** a tear is a point-mass lens. Up to four a frame bend
    the sky. Stars move outward and brighten, and a second pass draws
    each star's faint second image across the tear. Planets bend too,
    since they are ray-cast per pixel and their view ray is bent before
    the sphere test. Ships and stations are not bent. The lens is tied to
    the cloud's size, so it shrinks as the wake decays.
  - **Shift:** what is seen near a departure tear is redshifted, near an
    arrival blueshifted.
  - **The tear itself:** a brighter glow, then a churning veil filling
    the rip that hides whatever is behind it. The veil is dark and
    smouldering for a departure, lit from inside for an arrival
    (brighter than the space round it). The lips of the rip burn.
  - **Lightning, its own shader:** forked bolts built on the CPU cross
    the dark gap from the cloud on one side to the cloud on the other.
    Each re-flashes two to four times down its channel, like a real
    stroke. Arrival bolts are thicker, more forked and reach further:
    "very large, angry bolts of plasma discharge jumping the gap". No
    lightning on a mote under about ten pixels.
  - **The jump itself:** the red rift opening ahead in the charge and the
    blue way out at the end of the tunnel are cut out of the 2D picture,
    and the world layer draws the same veil through the hole. So you go
    in through a boiling dark cloud and come out through a lit blue one,
    with the lightning across it.
  - **Your own tears:** jumping leaves a red tear ahead of where you
    were, and you come out of a blue one that hangs behind you. Both
    decay like any other wake and are gone in sixteen hours. Visual
    only, and not saved.
  - **Lore,** in Astra's words, which is why nothing radiates forward:
    "we're not creating a bubble of superluminal space which carries
    particles, we're tearing space a new arsehole and punching our ship
    into the dimension which holds up 4D spacetime, beneath physics
    itself. Nobody knows why."
  - **Stations and ships bend too (second pass, same day).** Astra: "I
    do want the thing to lens planets and stations alike." Hulls are
    triangles with no per-pixel ray, so each vertex is moved to where
    its image is seen (`tearPush` in the mesh shader) and shifted red or
    blue like everything else.
  - **Only what is behind a tear bends.** Each tear now carries its
    distance. A planet, station or ship nearer than the tear (your own
    cockpit included) is left alone, with a short blend across the
    tear's own distance. Planets in front used to be bent too.
  - **A bent planet's drawing square** grows by an Einstein radius, so
    its pushed-out edge is no longer cut off flat.
  - **Lightning on the tunnel walls.** Astra: "we need to make the
    lightning stick to the inside walls of the tunnel." Each strike lives
    in tunnel coordinates (angle round the tube, depth). Its main channel
    crawls round the inside of the tube, riding toward you with the wall
    rings, and its forks reach along the tube. It is coloured like the
    walls (blue-violet ahead, red once beside you) and drawn bigger the
    nearer it is. It clings rather than strikes: half a second to a
    second, re-flashing three to six times, never dropping below a
    visible glow until it dies.
  - **A bit more lensing.** Astra: "a bit more lensing." Lens strength
    is now its own knob, `TEAR_LENS_GAIN` (1.55) in render.js, applied to
    the bending angle only. The cloud, slit and lightning keep their
    size, so the sky bends 1.55× harder round a tear of the same size.
    1.8 was tried first; it warped planets well clear of the tear.
  - **Known limits:** a planet still gets no second image, and a coarse
    hull bends as straight-edged facets.
  - *Tests:* new `test/tear.test.js` (29 checks). It covers the lens
    equation both ways and pins the shader text. It also checks screen
    size against the 2D cloud's floor and cap, that the slit follows the
    pole, and that every bolt crosses the gap, with arrivals thicker,
    more forked and longer.

- **Every ship type is for sale, and shipyards build large ones to order
  (2026-10-19).** Astra: *"I also want the player to be able to purchase
  ANY ship type, but only at shipyards can you get a customized L size
  ship."* Asked which ships: civilian, plus warships *"only for a navy
  you're in good standing with"*. What "customized" means: **both**
  built to order and refits only at a shipyard. The biggest ships get an
  **XL** class.
  - *Ten new hulls*, each flying the model its traffic class already
    flies. **S:** Wren Shuttle (unarmed, like every shuttle), Bollard Tug.
    **M:** Samaritan Tender, Sump Waste Hauler. **L:** Longhaul Freighter,
    Coldwater Tanker (the longest reach of any civilian hull), Naval
    Cutter. **XL:** Meridian Liner, Leviathan Bulk Carrier, Capital Ship.
    Every one clears the loneliest star laden. Every hull that can land
    can still lift off the heaviest world with a port. The Kestrel stays
    the mercenary hull.
  - *Warships are the navy's own.* A Naval Cutter is built only at a
    shipyard of a real power, for a captain ALLIED with it (40+). A
    Capital Ship needs 70+. A navy that wants you builds you nothing. A
    locked warship is still listed, with the standing it needs.
  - *Built to order.* At a shipyard every L and XL hull is on the books,
    whether or not one is on the floor. Its order sheet has one line per
    slot. Click a line ▶ to cycle through empty, your own fittings (moved
    across when you trade in), and everything on the yard's shelf. Below
    those: her name, a hull colour and a trim from eleven paints, and a
    live quote (hull + fittings − trade-in, with the power and mass
    budget). Nothing is spent until **BUILD** on the card, and the card's
    ship turns in the colours on the sheet.
  - *Elsewhere, as she sits.* An ordinary orbital dock still has the odd
    L hull on its floor. It comes with the dock's own fit, the gear at
    nine tenths of list. The fittings on the ship you trade in are taken
    at seven tenths, because nobody there can move them across. The hull
    list says what she carries.
  - *Refits only at a shipyard.* An L or XL hull's fittings cannot be
    bought or sold anywhere else. The fitting page says so once, at the
    top. Missiles and heat-sink charges are not fittings and are sold
    everywhere. S and M hulls refit anywhere, as before.
  - *XL is too big for ordinary ports.* An XL hull docks only at
    shipyards, highports and fleet carriers. Never on a pad, never
    underground, never at an ordinary orbital dock. The refusal says
    so on the approach.
  - *Paint.* Your hull colour and trim are drawn in flight on both
    renderers (the GPU path through a new paint input on the hull
    shader), and in the showroom. Windows and nav lamps are never painted
    over. A hull from any other counter is yard grey.
  - Tests: new `test/shipyard.test.js` (53 checks). The take-off checks in
    `ships` and `combat` now skip XL hulls, since they never land. The
    medium-hull floor-odds check now counts per hull, because with four
    medium hulls "a dock has at least one" was always going to read 100%.
    A fleet test that kept a Kestrel bought off an ordinary floor now
    keeps a Mule. The render test that looks for hull rows now recognises
    them by their size letter, because the old names can scroll below the
    cheaper new hulls. Checked in the real Electron shell with
    `tools/probe-shipyard.js`. `tools/electron-probe.cjs` now takes
    `PROBE_PROFILE=<dir>`, which runs a probe in a throwaway profile so
    one that docks or buys can never touch the real career's autosave.
  - Known: in flight every player hull is still drawn at the same 25 m,
    a liner included, as it always has been. Scaling the player's ship to
    its class is a separate change.

  *Saves:* additive (`ship.paint`; fleet records carry `paint`). No
  version bump.

- **Twilight worlds: tidally locked rings and sideways equators
  (2026-10-19).** Astra: "tidally locked worlds: they can have habitable
  regions right along their star-set zone, or the day/night line around
  the equator." Fully habitable, both kinds.
  - *Tidally locked.* A solid world inside 0.45 AU × (star mass)^⅓ is
    locked: one day per year, its pole on its own orbit's normal, and
    longitude 0 always under the star. In practice that is most red
    dwarf habitable zones and nothing near a sun-like star. If it is
    terran, ocean, desert or tundra and sits between 0.8 × the zone's
    inner edge and its outer edge, it lives in its **twilight ring**: the
    strip where the star sits low on the horizon forever, running over
    both poles, between a bleached dayside and an iced nightside.
  - *Tipped.* About one solid world in fourteen outside the lock line
    lies on its side (80–100° tilt), Uranus-style. If it is one of the
    same four types and inside the habitable zone, it lives in an
    **equator band**: each pole bakes for half the year and freezes for
    the other.
  - *Fully habitable* means the same as any other habitable world: life
    and culture notes, economy, development, and two or three stations
    plus one or two pads. Pads on a ring world sit in the ring, about 9°
    sunward of the exact terminator, so the star stays low but up all
    year. Pads on a band world sit within ±12° of the equator.
  - *On screen.*
    - The planet shader paints the zones by the real sun angle (locked)
      or by latitude (tipped). The living strip is tinted green so a
      desert ring world reads as somewhere things grow. Polar caps stand
      down on both kinds.
    - The NAV card says **HZ ring** / **HZ band** and "tidally locked" for
      the day, adds a one-line description of the strip, and appends "on
      its side" to the day length of a tipped world.
    - The SYSTEM tab and the slipspace chart preview name the strip too.
  - *Same seed, same systems.* The old rule is kept as
    `habitableGlobal`, and every id- and draw-sensitive site reads it, so
    every existing body keeps its id, name and orbit. The extra ports
    come from their own substreams after the last existing id. The one
    visible knock-on: in about 70 of 200 systems, a newly habitable
    world nudges the economy, and in a few of those the fleet carrier
    moves to a different port (it takes the garrison's name).
  - *Scale.* Across 200 kawartha systems: 506 locked worlds, 54 tipped,
    188 ring worlds, 18 band worlds, 91 newly habitable. Mean system
    development goes from 0.51 to 0.54. A first cut let rings reach in
    to 0.55 × the inner edge; that put a desert ring in more than half of
    all systems, so it was pulled back to 0.8.
  - *Rotation frames can now lean any way.* Adds an optional
    `rotation.az`, the azimuth of the tilt, read by Sim.surfaceOffset,
    Sim.bodyPole, Rings.ringFrame and GLWorld.spinOf. Only locked worlds
    set it; everything else takes exactly the old path.
  - New suite `test/twilight.test.js` (20 checks). It covers id, name and
    orbit stability against `opts.noTwilight`, the subsolar point all
    year (worst 10.1°, all of it eccentricity libration), pads in their
    strip, the star's height over ring pads, port counts, determinism,
    and the card wording.

- **Every ship has a captain, and they remember you (2026-10-18).**
  Step 1 of the named-captains / rumours / disguise plan
  (DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3). Every NPC ship — traders,
  patrols, pirates — has a captain with a name, a temperament (wary,
  friendly, mercenary, principled, gruff), values (abolitionist,
  profit-first, lawful, pirate-sympathetic), a home port, and one friend
  and one rival among the other captains in the system. All of it is a
  pure function of the seed and the ship, drawn from its own substream,
  so no existing seed changed. A captain only gets a saved record once
  they have actually dealt with you; their memory of you is numbers, not
  text — honesty and feeling as two separate dials, a count of first-hand
  encounters, and the single most memorable thing you did to or for them.
  A trader you pull off its rails is the same person it was on the
  timetable; a patrol riding a lane is not the freighter on that lane.
  New `src/captains.js`; pinned by `test/captains.test.js`.

- **Hail is a greeting, from furious to grateful (2026-10-18).** Astra:
  "Are you a filthy pirate, or do you rescue stranded ships?" Pressing
  Hail now gets you the captain, by name, in a voice set by how they feel
  about you and coloured by their temper — and, unless they are neutral,
  *why*: "I still have your scorch marks on my hull", "They say you pull
  stranded ships out of the dark". **Seen beats heard**: a captain who
  has dealt with you goes by what they saw; one who has never met you
  goes by your public record, read through their values (a pirate-minded
  captain admires the career a lawful one despises). Grateful is reserved
  for someone you actually saved. The comms row says who is in the chair
  and their mood before you press it. The public record is new: assaults,
  robberies, kills, pirate kills and answered distress calls are now
  counted. Weights measured across 24 seeds, not guessed — the first pass
  put every trader at "furious" for one bad career, and the test prints
  the spread so it cannot drift back.

- **Disguise: a new name, new paint, a spoofed transponder
  (2026-10-18).** Step 2. At a yard where somebody can be bought
  (corruption 60, the grey market's own line) the station menu offers a
  paint-and-name refit (1,800 cr) or a full refit with a spoofed
  transponder and re-plating (6,500 cr); restoring your own colours is
  400 cr anywhere. Your public record and (later) rumours attach to the
  identity you broadcast, so a disguise starts with a clean sheet — but
  captains who have seen the **hull** may recognise it: about half the
  time under paint, about a fifth under a full refit (measured in the
  test), more the more often they have seen you. Being caught is a seen
  lie and they say so. A captain you fooled keeps a separate memory of the
  stranger they met, so what you do in disguise does not bleed onto the
  real you. A legal rename or re-registration is **not** a disguise — the
  registry links it, and your record follows. A newly bought hull flies
  its own colours. Fleet markings exist as data (your fleet: a three-letter
  code and a bicolour off the seed; a faction's: a tricolour off its chart
  colour) but nothing paints them on a hull yet. **Not yet built:** the
  sabotage missions from the same section of the plan.

  *Saves:* additive (`captains`, `record`, `ship.disguise`,
  `ship.disguiseCount`), no version bump; an older career loads with
  nobody who remembers it and a clean record.

- **Your own words on the band, read back before they go (2026-10-18).**
  Step 3. The police channel has a new row, *Distress call — in your own
  words*, and every ship has *Talk…* (*Send a message*, *Ask what they
  carry, and where*). You type; the game reads what you typed into claims
  — cargo, situation, threat — and shows them back as **Read as** before
  anything is sent, each one checked against your real ship. A claim that
  is not true is marked, a mayday from a ship that is fine says *Ship not
  in distress*, and the button changes to *Send anyway — knowingly
  false*: every lie in this game is a conscious one. Lies are weighed on
  the design's two axes (what they exploit, what they cost responders);
  "freed slaves aboard, drive about to explode" when neither is true is
  the worst there is. Captains who hear your call decide whether to come by
  their values (an abolitionist races in for people in a hold; a
  pirate-minded one may come for very different reasons), how they feel
  about you, and whether they have caught you lying before. When they
  arrive they look: a false emergency is plain to see, a false cargo claim
  only to a captain who scans the hold. An honest call from a ship really
  in trouble also goes out on the existing mayday, and the first captain
  there passes a hose. Captains answer messages from their real state and
  temper — a wary one may say "None of your business."
  New `src/messages.js`; pinned by `test/messages.test.js`.

- **Captains call for help too, and some of them are lying (2026-10-18).**
  On a seeded schedule (a 40% chance every four hours, a pure function of
  seed, star and clock), a trader in real trouble calls for help — the
  first rescues the game has ever been able to offer, and the way to a
  captain who is genuinely grateful. Where pirates work the lanes, close
  to half the calls are bait, transmitted from wherever the pirate is
  actually lurking, so answering one flies you into its intercept with
  nothing new spawned. *Check the transponder* is the tell: a real caller
  checks out; a copied registration belongs to a ship the registry puts
  somewhere else entirely; an invented one is not on file at all.

- **Captains remember your deeds and your words, and never say the same
  line twice (2026-10-18).** Astra: *"just to say 'last time I responded
  to your call, you were lying' or 'you saved my cargo and my crew, not to
  mention my ship. Looking for another fleetmate? We could go into
  business together.'"* Each captain keeps a short log of what happened
  between you — what was at stake, and your own words, quoted — and builds
  the hail from it: a greeting, the memory, and a closing, coloured by
  how they feel. A captain only ever talks about something that actually
  happened. Every line said is remembered and never repeated; back-to-back
  hails never reuse the greeting, the memory or the closing. Being *told*
  something is kept but does not count as having seen you act, so one
  chat does not wipe out what a stranger has heard about your piracy.
  (A generative model was considered for this and set aside: these lines
  need no writer, cost nothing, and cannot invent a deed you did not do.)

- **A small language model reads what you type (2026-10-18).** Astra:
  *"we want the maximal ability to process language in English."*
  transformers.js runs **all-MiniLM-L12-v2** locally in the game — offline,
  no network, ~35 MB — so "our engines are toast" reads as a drive
  failure without anyone having written "toast" down. Chosen by
  measurement, not size: five models were tuned on half of a labelled set
  of 56 phrasings (`test/reader-phrases.json`, written before any model
  ran) and scored on the other half. Held-out accuracy per claim:

  | Reader | Held-out | Paraphrases | Mixed | Size | Per message |
  |---|---|---|---|---|---|
  | Phrase matcher alone | 82.1% | 77.3% | 70.8% | — | <1 ms |
  | **MiniLM-L12 + matcher** | **92.9%** | 90.7% | 91.7% | 35 MB | 7 ms (node), ~35 ms in game |
  | MiniLM-L6 + matcher | 91.7% | 90.7% | 87.5% | 24 MB | 4 ms |
  | gte-small | 89.3% | 89.3% | 87.5% | 35 MB | 8 ms |
  | bge-base | 89.3% | 92.0% | 95.8% | 111 MB | 20 ms |
  | bge-small | 85.7% | 88.0% | 91.7% | 35 MB | 8 ms |

  The set is small — a point or two is one sentence — and it stays in the
  suite to catch any slide. Negation is still read by the matcher
  (embedding models cannot tell "carrying slaves" from "not carrying
  slaves"), and a negator that *describes* trouble ("can't steer", "no
  thrust") is no longer read as a denial. Known miss: "We are dead in the
  water, kids aboard" still loses the drive failure; the fix for it lost
  on the measurement. In the real Electron shell the model is ready about
  2 seconds after launch; until then, or if its files are missing, the
  game reads with the phrase matcher and nothing else changes. Staged by
  the new `npm run models` (which `npm run dist` now runs) into `lang/`
  and `vendor/`, both gitignored; re-run the comparison with
  `npm run bench:reader`. The first in-game test caught that
  transformers.js's `web` build expects a bundler; the self-contained
  build is the one vendored.

  *Saves:* additive (`broadcasts`, and captain memories gained `log`,
  `said` and `lastBits`), no version bump.

- **Favours, friends and rivals, and going into business (2026-10-18).**
  Step 4 of the captains plan (sections 6 and 8), in the new
  `src/favours.js`.
  - *Debts.* Save a ship, or answer a real mayday, and her captain owes
    you one; answer *your* honest mayday and you owe her. Clamped at ±5.
  - *She pays it back.* Unasked: a captain who owes you and sees a raider
    on your lane warns you, with its name and range. Or you call it in
    from **Talk…** — where the pirates are, reaction mass passed across
    (within 50 km), or a word with her people (+5 standing). Each costs
    one, and the note says what it does before you press it.
  - *She calls it in.* A captain you owe, on your board, asks for credits
    or reaction mass. Her row on the comms page leads with the ask, a
    countdown and *Wire her… / Pass across… / Refuse*. Refusing — or
    letting it run out — costs feeling, and she brings it up: a refusal
    outranks the rescue that earned the ask.
  - *Friends hear, rivals wonder.* Rob, shoot, lie to or exploit a
    captain and her friend hears it near-first-hand — on the `heard`
    dial, counted above your public record for someone who has never seen
    you, and at a third for someone who has. Save her and her friend warms
    to you, and her rival grows suspicious. Kill her and her friend knows
    whose guns. They say it by name: *"You crossed (her name). That means
    you crossed me."* Hearsay keeps to the colours you wore.
  - *Going into business* — Astra: **"Offer both."** A grateful trader's
    **Go into business together…** row gives two deals. **Partners:** she
    brings her ship into your fleet, takes standing orders, draws no
    wage, and every contract she delivers splits 50/50; she stays hers —
    the yard will not sell her — and she leaves, ship and all, if her
    berth fees go unpaid, if you turn on her, or if you start killing
    crews (or robbing traders, unless she is profit-first). **Crew:** she
    hands her ship to her mate and comes aboard as a skilled officer
    (rated good or better) at a friend's wage, 60% of the going rate.
    Either way her ship leaves its lane for good. Patrols and pirates
    never make the offer — and no longer say they will.
  - Tests: new `test/favours.test.js` (64 checks).

  *Saves:* additive (`joined`, `favourAsk`, `tipAt`; captain memories
  gained `heard` in use, `debt` in use and `joined`; fleet records may
  carry `partner`; crew may carry `wageMul`), no version bump.

- **Rumours travel at the speed of ships (2026-10-18).** Step 5, the last
  of the captains plan (section 3), in the new `src/rumours.js`. Until now
  a stranger read your public record, and every stranger in the galaxy
  knew it the instant it changed. Now:
  - *A rumour starts where somebody saw.* Robbery, a killing, a rescue,
    a lie found out, a pirate kill: each starts a rumour aboard the ship
    that saw it. That is the victim if she lived, otherwise the nearest
    honest ship or station within witness range. If nobody was close
    enough, there is no rumour at all. A ship destroyed before she berths
    takes the story with her.
  - *It travels on the timetable.* No faster-than-ship news. A ship that
    knows tells the port she next berths at, and every ship that berths
    at a port that knows carries it on. The timetable is a pure function
    of the clock, so who hears when is calculated, not simulated: the
    earliest arrival over the berthing schedule, once per rumour per
    system, accurate at any time warp. In a busy system it takes days to
    reach everyone.
  - *Between stars, with the trade.* Once a port knows, the news goes to
    each nearby star's busiest port. The four nearest stars are linked,
    and the trip takes 7 hours per light year (the same as your drive)
    plus a day's wait for a ship heading that way. Three hops at most,
    with the rumour 40% fainter at each. You can outrun your
    reputation, or be caught by it at the next port.
  - *Seen beats heard.* A captain who has seen you act goes by what she
    saw. A stranger reads only the rumours that have reached her ship,
    through her values (lies on the band now count too, and a mayday used
    as bait counts three times as much). She says where she heard it: *"At
    Halden Dock, they say you killed the crew of the Redsail Tender."* /
    *"Out in Kappa Lyrae, they say you pull ships out of the dark."*
  - *Friends hear at ship speed too.* Step 4's friend and rival hearsay
    now reaches them when the news reaches their ship, not instantly.
  - *Rumours stick to an identity.* Each one is about whoever you were
    flying as, so a fresh transponder starts unheard of, and a disguise
    that earns a name keeps it.
  - *They fade.* Half as loud every 120 days.
  - **Listen to the dock talk**, a new row on a port's comms page while
    docked: what has reached this port about you, loudest first.
  - Decisions I took that you may want changed: rumours do not
    *distort* as they are retold, they only fade with distance and time;
    the half-life is 120 days; the reach is three star hops. Any of the
    three is a single constant at the top of `rumours.js`.
  - Tests: new `test/rumours.test.js` (38 checks). Among them, the
    calculated berthing times are compared with the real timetable at 300
    sample points.

  *Saves:* additive (`rumours`, `hearsay`, `rumourSeq`, `recordLegacy`).
  Who has heard what is not saved; it is worked out again from the
  timetable. A career saved before this loads with its record as it stood
  copied into `recordLegacy`, still known everywhere, so nothing you had
  done is forgotten. Everything from then on travels by ship. No version
  bump.

- **The NAV card: the chart's view of a locked world (2026-10-19).**
  Astra: "slipspace chart info should be displayed for current system in
  the nav menu. Stuff like what type of planet each of the bodies in order
  from their star are", then a box under the locked planet in the world
  view, "integrate the two somehow, using a tab", and in the cockpit "on a
  panel, not on the HUD". Lock a planet or moon and its card has two tabs:
  - **WORLD**: where it sits (4th of 12 from the star, or moon of its
    planet), its type with `HZ` for a habitable-zone world, its air,
    moons and ports, surface pull, length of day, and the chart's notes
    on life and people; plus range, closing and ETA.
  - **SYSTEM**: every planet numbered out from the star with its type and
    ☾ moons and ⌂ ports, the locked one lit. Clicking a row locks it.
  
  It hangs under the locked world in the exterior and map views, with a
  leader to it (above it if there is no room below). When the world is off
  the screen or behind you, the card pins to that edge with an arrow
  pointing the way to the world. In the cockpit it is the NAV console
  screen, read-only like every console screen, so **M** flips the tab (M
  was free since the market moved to comms); the other two places take
  clicks. F3 shows it as its NAV tile. `Screens.systemManifest`,
  `Screens.worldFacts`, `drawWorldCard`; pinned against real generated
  systems by `test/navsystem.test.js` (95).

- **NAV and TARGET are different screens now (2026-10-19).** Astra: "call
  that screen NAV instead of TARGET — target should be reserved for ships
  that are targeted either for hailing or weapons fire." The lock screen
  heads itself NAV for a planet, moon, station or port and TARGET only for
  a ship. The contact list, which was also called NAV, is CONTACTS, the
  name F3 already gave it. In F5 → PANELS they are listed as NAV / TARGET
  and CONTACTS; saved panel assignments keep working, since the ids did
  not change.

- **Which way you are facing, on the glass (2026-10-19).** Astra: "we need
  a way to know if the ship is facing into or out of the direction of
  travel that's easier to find on the HUD". Under the attitude line, a
  cue reads **PROGRADE** or **RETROGRADE** with how many degrees off you
  are, boxed in amber when you are within 10°; NOT MOVING when there is
  nothing to face. The retrograde marker (circle with a cross) is now on
  the glass whenever it is in front of you, and when prograde is off the
  glass an arrow at the edge points the way to turn to find it. Before,
  turning your tail to your motion simply made the marker vanish. Both
  markers carry the dark halo. `Render.facingInfo`, `Render.drawFacingCue`.

- **Orbit line: ahead solid, behind dotted (2026-10-19).** Astra: "orbit
  already traveled should be in dotted lines, or orbit to be travelled,
  whichever reads easier." The half-period ahead of the ship is the solid
  line and leaves it the way it is going; the half-period just flown is
  dotted and arrives at it from behind. Split by flight TIME, not by
  angle, so on an eccentric orbit the solid half really is where you will
  be in half an orbit. Re-split every frame, so the join stays on the ship
  at any time warp. The ORBIT console page draws its sketch the same way,
  with an arrowhead showing which way round you are going.
  `Kepler.samplePathSplit`; pinned by `test/orbitline.test.js` (43),
  which flies the ship half a period by brute RK4 to check the solid half
  ends where the ship really is.

- **Speed and altitude boxes, and a G meter (2026-10-18).** The rest of
  the fighter-HUD air data, either side of the ladder at horizon height.
  Boxes rather than tapes (the F-35 choice): our speeds run from mm/s to
  multiples of c and a tape is useless at one end of that range or the
  other. **Speed** (left) is relative to the same body the heading tape and
  ladder use, with its unit printed under the box because the unit changes
  with the regime: M/S on approach, KM/S in orbit, c in cruise. **G** sits
  under it, as on a real jet, with **PK** (the peak since you last left a
  berth; a berth or the arrival rail clears it). G is *felt* G, gravity
  excluded: coasting in orbit is 0.0, a burn is the burn, air is the drag,
  and parked it reads the deck's 1.0 (see artificial gravity, below).
  **Altitude** (right) is above the surface of the
  reference body: metres below 10 km, then km, then Mkm. Under it,
  vertical speed with an up or down arrow, and the air: inside an
  atmosphere, the density in kg/m³ in amber (the number atmosphere mining
  will run on); above one, how far down the top of the air is. Same dark
  halo as the heading tape. `Sim.feltAccel`, `Render.drawAirData` and its
  four readout formatters; pinned by `test/airdata.test.js` (43).

- **Decks have artificial gravity (2026-10-19).** Astra: pads and common
  areas have "clarke-tech artificial gravity generators ... just to make
  design easier." Docked anywhere (a ring berth, a station that does not
  spin, a pad on a moon you could jump off) and on the arrival rail once
  you are through the door, the G meter reads **1.0**, pressing up off the
  deck. Before this it read the real physics, which was right and not the
  game: 0.036 G on a small moon's pad and 0 in a station.

- **Air drag is a quarter as brutal (2026-10-19).** Astra, after the new G
  meter showed a coast through thick air at 2 km/s pulling 17 G: "make the
  air drag less brutal on the ship." One knob, `Sim.DRAG_SCALE = 0.25`:
  drag area was Cd·A with Cd taken as 1, which is a brick, and a quarter of
  that is a streamlined hull. The same coast now pulls 4.4 G. Air bleeds
  speed a quarter as fast, so scoop passes survive at depth and an
  aerobrake takes longer or goes deeper. **Heat is unchanged** (it reads
  density and speed, not drag), so a fast entry still cooks you; you just
  are not also crushed. Every drag behaviour the tests pin is a ratio
  (orbits inside air decay, laden ships hold orbit longer, gear down costs
  a third more) and all still hold.

- **Heading tape on the cockpit glass (2026-10-17).** The fighter-HUD
  strip across the top, above the bank arc: the scale slides, the caret
  stays put, and the boxed number under it is your heading to the degree.
  North is the **dominant body's own spin pole** laid onto the local
  horizon (the same horizon the pitch ladder levels against), so N/E/S/W
  are true directions on whatever world has you, and E is always the way
  the ground turns. Cardinals are lettered (N in amber), intercardinals sit
  on a row above the numbers, and a `REF` tag at the end names the body
  the compass is using, because north changes when the dominant body does.
  The nav lock gets a steering bug on the strip; off the strip it parks as
  an arrow at the end that is the shorter way round. On a pole the strip
  says `NORTH POLE · NO HEADING`; with the nose straight up or down the box
  reads `---` and the scale goes dark rather than freezing on 000. It is
  drawn with a dark halo instead of the glass's additive glow, so it stays
  readable over a sunlit planet. Shown while you are looking ahead, like
  the bank scale. `Sim.bodyPole`, `Sim.headingAngles`,
  `Render.drawHeadingTape`; pinned by `test/heading.test.js` (41).

- **The sky at cruise speed is physics, not paint (2026-10-17).** Astra
  chose the model from four with sliders in front of her: *special
  relativity below c, the classical outrun-the-light picture above it,
  easing from one to the other between 1c and 1.5c.* Below c, stars are
  seen where aberration puts them — crowding into a ring ahead as you near
  c — and coloured by their own temperature times the Doppler factor:
  ahead blue and bright, behind red and dim. Above 1.5c there is no
  aberration, the forward shift is the classical 1 + β cos θ, and the rear
  sky is black because its light cannot catch you. Every star has a
  temperature now (from the tint it was seeded with, so no seed's sky
  changes). Drawn in the world layer's star pass, behind the planets.
  `Render.cruiseSky`; pinned by `test/cruisesky.test.js`.

- **Star trails follow each star, not the nose (2026-10-17).** The old
  cruise streaks all pointed away from the heading. Now a star's trail is
  the path its *apparent* position has traced on screen over the last
  third of a second, each point through that moment's own camera — motion
  blur and comet tail in one rule (Astra picked both). Turns swing and
  curve the trails, looking about blurs them, a change of speed stretches
  each along its own aberration path; a steady cruise keeps a short stub
  toward where the star would sit slightly slower. The painted bloom at
  the vanishing point and the darkened screen edges are gone. The trails
  are drawn in the world layer straight after the stars, so a planet
  covers them exactly as it covers the stars — on the 2D overlay they ran
  across planets' faces, which Astra ruled out (*"that breaks the
  immersion"*). `Render.cruiseTrails` + `GLWorld.drawTrails`; only a
  machine with no world layer falls back to drawing them in 2D.

- **The ring's lift car rides down with the ship (2026-10-17).** Astra:
  *"we need the car to ride with the ship."* The converter now reads the
  art's own `extras.motion` lift declarations and records each car (and
  the `hatch` panels over it) face by face; the renderer lifts them out of
  the hull and draws the car wherever the arrival says it is. Ship and car
  move by the same eased number, so the hull cannot drift off the pad; the
  empty car climbs back once the ship is clear, and comes down to collect
  it on the way out. You collide with the car where it is drawn. The floor
  hatch is there while shut and gone while open (the art says it is a
  hatch, not how one moves). Only the ring uses a car on its routes; the
  skimmer's and spine's cars stay at rest. `test/transfer.test.js`.

### Changed

- **One line, really: the mining work and the ship cuts come in (2026-10-30).**
  Asked to test the mining drones, the work turned out not to be on master
  at all. It was in a second family of checkouts that had grown from the
  Abby release and never reached GitHub: `X:\Manifest-trial`,
  `X:\Manifest-merge` and `X:\Manifest-ships`, plus an older copy in
  `C:\Manifest-merge`. Astra: *"Merge first, then test"*, with all of
  their sessions finished.
  - **The mining line is merged.** It brings survey instruments graded
    by what they see, deposits that sit somewhere on a world, the polar
    survey orbit, claims and drones, the mining laser and cannon, gas
    skimming, rock torpedoes and the ordnance panel, countermeasures and
    the shroud suite, other prospectors, a fence in every system,
    resource wars, skimmers and laser ships under work orders,
    no-man's-land systems, ridden lifts and the burn autopilot that
    warps.
  - **The station-growth checkout is recorded as merged.** Its two extra
    commits were already in: the first copy of the graded-survey commit,
    and a scratch script.
  - **Astra's ship-cut table and its tools are merged** (69 new files).
  - **C:\Manifest-merge is superseded.** Its survey commit was carried
    over, and its two uncommitted lines were already on master.
  - **Where both lines changed the same thing:**
    - The cutaway keeps Astra's double orange line of 2026-10-26, and gains
      the mining line's ground-port section box and kept deck.
    - A crime report carries both the take and an unidentified hull.
    - Open ground with a recorded spot rides the world and lifts on R;
      other landings keep the settle-and-lift-off fix.
    - F5 tabs: STATUS, GUNS, ORDNANCE, PANELS, NOTES.
    - The station geometry takes the finer vertices (the flicker fix),
      with our move of the ground-site aprons re-applied.
  - **Tests:** 62 suites now, all green. That includes city-sites,
    growth, prospectors, stealth and wars, which the mining line kept
    outside `npm test`.
  - **`npm run unpack` now refreshes stale copies by itself.** It keeps
    a record of what each working copy was when last in sync
    (`.pack-state.json`, untracked), so a copy that is only old (after a
    merge or a pull) is refreshed, while one you edited is kept, and
    `npm test` says which.
- **The models and station geometry are stored compressed, and the game
  unpacks them itself (2026-10-30).** Astra: *"can you compress the data
  somehow?"*, then *"and ensure the executable can unpack the compressed
  data."*
  - Every .glb model and the station geometry (`src/ports/*.js`) is now
    stored gzipped, in plain git, with no Git LFS. That is 403 files, which
    go from 684.8 MB to 60.5 MB.
  - It is lossless. Each .gz was checked against the LFS checksum of the
    file it replaces, and all 403 match byte for byte.
  - **The .exe ships only the packed station files, 33 MB instead of 270 MB.**
    Its `game://` scheme unpacks each one in memory as the game asks for it
    (`electron/packed.js`), so the game sees exactly the script the
    generator wrote. Checked on a real Windows build: all 90 stations
    loaded from the .gz files, with no plain copies present.
  - The dev server (`tools/serve.js`) and the node loader in `src/ports.js`
    that the suites use read the .gz in the same way. The Pages deploy
    unpacks them on the runner, so the website doesn't change.
  - The plain files are still on disk as working copies that git ignores,
    so Blender and the tools open them as before.
    - `npm run unpack` writes them out after a fresh checkout.
    - `npm run pack` stores your changes.
    - `npm test` fails while any working copy differs from what is stored,
      so an edit can't silently miss the repo.
  - `test/packed.test.js` has 12 checks, and `tools/probe-packed.js`
    checks a packaged build.
  - The CI and Pages workflows no longer touch LFS, so there is no LFS
    bandwidth cost on deploys.
- **One line of work (2026-10-30).** Astra: *"let's take all the various
  work streams and integrate them into one."* Everything now lives on
  `master`:
  - The parallel sessions' uncommitted work from 2026-10-26 to 10-30
    (boarding, the tithe, upkeep, notes, cargo containers, hulls sized to
    their interiors) is committed (136d10f).
  - The Pages site branch (the landing page and the workflow that
    publishes the game on a push to master) is merged in.
  - The Abby release line had grown from a different root. Every one of
    its commits was already in the game's line, which was checked line by
    line, so it is joined by a merge that keeps the game exactly as it was.
    Its history and the release tags v0.1.0-alpha5 to v1.1.0-beta are all
    on master now.
  - The `driftwood-2026-10-15`, `crawler-abby` and `pages-site` branches,
    the website's spare worktree, and two old stashes (both already in the
    game) are retired. Every old head is kept as a `backup/2026-10-30-*`
    branch or tag.
  - Nine test suites that had never been part of `npm test` are in it now
    (farms, transfer, cruisesky, heading, airdata, orbitline, navsystem,
    twilight, cruisedrive). All of them pass.
  - Port models and `src/ports/*.js` are stored through Git LFS, as
    `.gitattributes` had asked for. Their content did not change.
    `Claude outputs/` is ignored.
  - Nothing is pushed yet.
- **The more you take, the more serious the crime (2026-10-30).** Astra, after
  one hold-up came to 41,028 cr: *"that's a lot of money, it should be a more
  serious crime the more money you take."*
  - A hold-up is charged its flat 400 cr plus half of what you took: credits,
    or cargo at its base price (waste counts as nothing).
  - Half, not all, so that being caught costs most of a big score rather than
    more than all of it. Otherwise the big transfer would be a trap rather
    than a choice.
  - Typical charges when reported:

    | Take | Amount taken | Charge |
    |---|---|---|
    | Freighter's cash box | 1,900 cr | +950 cr (with the flat 400, past the 800 cr at which police hunt you) |
    | 40,000 cr transfer | 40,000 cr | +20,000 cr |

  - The take rides on whichever report is still to come: a witness's, or the
    victim's own distress call. The report line says how much was taken and
    what it added.
  - A second hold-up of a ship that has already called it in is added at once,
    with the new figure.
  - Buying a witness's silence costs more too: 15% of what you took, on top of
    the usual price.
  - `upkeep.test.js` checks that the take rides on the pending report and that
    the bounty rises by the flat charge plus half of what was taken.

- **A trader has one purse, and a gun gets you part of it (2026-10-30).**
  Before, a shakedown took a fixed 150-850 cr that had nothing to do with the
  purse on her own screen, which the robbery left untouched. Astra: *"give the
  option to take more than a shakedown, but not everything, because that would
  mean they have nothing to get to port."* On a scheduled trader, the piracy
  menu now offers:
  - **Demand the cash box.** The cash aboard, a tenth of her purse. Once
    you've taken it, it stays empty until she is next in port.
  - **Demand a transfer.** Everything above what she needs to make port: a
    leg's reaction mass at hydrogen's price, plus her berth fee. She keeps
    that much and pays the rest.
  - Both come off the purse her screen shows, until she next settles with her
    owners (every six legs), when her float is topped back up. So a ship you
    robbed has less to pay you with if you answer her mayday, and she's worth
    robbing again next month.
  - Ships without a timetable (pirates, lane haulers torn out of slipspace)
    keep the old single "Demand credits".
  - Rescue payments use the same purse and the same top-up.
  - Typical takes (`Claude outputs/purse-survey.cjs`, 1,072 ships):

    | Ship | Cash box | Transfer (median) |
    |---|---|---|
    | Shuttle | ~400 cr | 2,500 cr |
    | Hauler | ~630 cr | 5,100 cr |
    | Freighter | ~1,900 cr | 15,800 cr |
    | Tanker | ~2,200 cr | 17,600 cr |
    | Liner | ~2,900 cr | 24,900 cr |

    The old shakedown was about 500 cr whatever the ship.
  - `upkeep.test.js` covers the cash box, the floor the transfer leaves, a
    second demand getting nothing, the top-up at settling, and the comms path
    end to end.

- **A small hold shows more of what is in it (2026-10-30).** A hold with more
  cargoes than stacks (a Mule's has two slots) used to show only as many
  cargoes as it had stacks. Now each container is its own cargo, biggest
  first, two to a stack, and a mixed stack's label names both. Holds with
  room for every cargo are unchanged: still one cargo to a stack.

- **Ships run about half full, and are sized for it (2026-10-30).** Astra:
  *"half-full holds that arrive at a rate commensurate with that, and have
  less XL size haulers."* Measured across 80 seeds first: waste haulers
  drawn at a median 95 m were 9% full, freighters 27%, tankers 29%, and
  local shuttles were carrying three times what a shuttle holds.
  - A ship's hold now holds her hull's capacity times the square of how
    much longer she is than her fitted length (`Gen.holdCapacity`); her
    walked hold, her screens and her crates use the same number.
  - Each scheduled route's ship is sized so the heavier of her two legs
    fills her to her own 42–62%, between her hull's fitted length and
    her class's longest (shuttle 70 m, freighter 150, hauler 110,
    tanker 190, liner 190). Where a bound bites, she runs more or less
    often instead (at most three times less often), and every leg's
    tonnage moves by the same factor, so what each market receives per
    day is unchanged. The rare load too heavy even then gets a ship
    longer than her class's longest rather than an overfull hold.
  - After, across the same 80 seeds: every class runs at a median 50–53%
    full (10th–90th percentile 43–61%). Waste haulers are now a median
    38 m, 70 m at the 90th percentile; the 100 m ones are rare.
    Freighters 88 m, tankers 117 m, liners 147 m. Local shuttles grew
    to 70 m and run more often, because what they carry is a third of
    each port's through-flow.
  - Return legs are lighter wherever the far end exports less.
  - Its own random streams: every other draw in the generator is what it
    was, but ship sizes and some timetables in every system change.
  - `test/boarding.test.js`: the hold table matches the hulls, the drawn
    hold matches the timetable's, and 1,071 scheduled ships across 40
    seeds run at a median 51% with none over full.
- **Every hull resized to fit her interior (2026-10-26).** Astra: *"if you
  have to resize hulls to fit their interiors, do it."* `tools/fit-hulls.js`
  finds, for each model, the smallest length and cockpit position at which
  every room on every deck sits inside the hull (hull above and below each
  sample, 4% edge allowance). It writes `src/hullfit.js` (`HullFit`), which
  `render.js` reads for `TRUE_LEN` and the cockpit anchor.
  - New lengths, in m:

    | Hull | m | Hull | m | Hull | m |
    |---|---|---|---|---|---|
    | Talon | 25 | Dart | 33 | Kestrel | 34 |
    | Mule | 35 | Wren | 25 | Bollard | 25 |
    | Samaritan | 29 | Sump | 31 | Longhaul | 38 |
    | Tanker | 51 | Cutter | 36 | Meridian | 80 |
    | Leviathan | 80 | Crawler | 164 | Heavy Tug | 31 |
    | Heavy Shuttle | 30 | Trader | 32 | Runner | 40 |
    | Enforcer | 31 | Enforcer Heavy | 31 | Fighter | 25 |

  - The capital ship and the carrier keep their lengths and bridges.
  - Bigger ships need bigger berths. A port turns you away when your hull
    won't fit its berth, and ports that don't take XL hulls refuse them.
  - The cargo bay now hangs off the aft end of the passage, with a door, so
    the airlock can have the port side.

- **Everyone in a pressure suit; the face is in a sketch (2026-10-25).**
  Astra: *"why don't we replace all NPC models with those that have
  pressure suits and helmets"*, then: *"Helmets remain on, but during
  chat, a portrait drawn in a 2D style and built a little bit like an FBI
  sketch."*
  - **The suit** (`npcmodel.js`): every body now wears a sealed helmet
    with a dark face plate and a faint HUD line, a seal ring at the neck,
    and a life-support pack with a hose up to the helmet. Each role's old
    headgear became its helmet, so roles still read across a room:
    - engineer: hard-hat shell and lamp, yellow or red on a Syndicate ship;
    - security: SEC band and sun peak;
    - medic: white helmet with the green disc;
    - gunner: ear cups and the red eyepiece;
    - raider: battered helmet with a rust crest and orange goggles;
    - pirate captain: spike and red eye;
    - enforcer: gold band;
    - fixer: gold-tinted plate;
    - marines, tactical and heavies keep the slab helmets they already had.
    The raider's bare tattooed arm is now a patched sleeve with the tattoos
    painted on.
  - **The portrait** (`portrait.js`, new): talking to someone shows their
    face beside what they say. It is assembled like a police composite:
    face shape, jaw and chin, eyes, brows, nose, mouth, ears, hairline,
    age lines, and the occasional scar or mole, each picked from a small
    catalogue by the person's seed. It is drawn in graphite on paper:
    outlines laid twice, hatching for tone, the shadow side
    cross-hatched, and the suit's collar ring at the bottom. Skin tone,
    hair and stubble come from the same draws as the body's painted face
    (`NpcModel.lookOf`), so the sketch is the person in the suit. The
    same person is always the same face.
  - Tests: `npc.test.js` checks that every body is sealed and that the
    portrait matches the body. Probe: `tools/probe-suits.js`.

- **Mouselook on foot (2026-10-25).** Astra: *"we're going to autoset
  mouselook for first person view."* Asked: **on foot only**, with the
  **pointer captured**. When you get up out of the seat, or walk a station,
  the mouse turns your head with no button held, and the pointer is hidden
  and locked to the window so you can turn all the way round. Hold left Alt
  to get the pointer back for the icon bar; let go and the mouse looks again.
  Esc, the menu, any F-screen and sitting down release it too, and a click
  (or any key) on the way back captures it again. The seat is unchanged:
  drag to look, right-Alt free look, F9 mouse aim. The walking hints now say
  "the mouse looks" and "hold Alt for the pointer". Probe:
  `tools/probe-mouselook.js`.

- **The loading screen says MANIFEST (2026-10-25).** The boot screen
  (`index.html`, `#boot`) still read "PROCEDURAL SPACE GAME", the working
  title. It now reads "MANIFEST"; the tagline under it ("gravity,
  clockwork, cockpit and cargo") is unchanged.
- **2026-10-24: every city site's town stands somewhere of its own.**
  Astra: "randomize the location of the city portion and the domes on
  those ports, without putting them on the landing apron or the door."
  The pad and runway city sites (s, m and l) carry their settlement as one
  piece in the art: three habitat domes, two greenhouse domes, the tubes
  between them, a water tank, sheds, solar panels and a mast, on a slab of
  its own. It always stood in the same corner. Now each port turns it to
  its own heading and stands it in its own place: on the site plate or
  beside the field. It stays clear of everything standing on the site, and
  further clear of the pad, the runway (and the runway's line well past
  both ends, under the approach and climb-out) and the doors. It stays
  within 1.12 of the site's half-span, so it never stands in the town
  dressing round the port. The domes move with the city rather than on
  their own: they are three sizes, and each one's vestibule faces the tube
  that reaches it, so a dome moved alone would leave a tube running into a
  blank wall. `tools/port-sites.cjs` reads the .glb models and writes
  `src/port-sites.js` (where each city is, and what it must keep clear
  of); render.js lifts exactly the city's 1,772 triangles out of the port
  (every corner inside the city's box: by centre it once took a slab of
  ground with it) and draws them where `Render.citySpot` puts them. The
  seed is new, `port.dressing.citySeed`, on its own random stream: the
  galaxy fingerprints and every port's signs, blocks and domes are
  unchanged. Where the art had the city there is now open site plate.
  `test/city-sites.test.js`, 52 checks.
  Same day, second pass: **the domes stand on their own, and the tubes
  always join them up.** Astra: "ensure that the domes always have tubes
  that connect to a branch point, a thicker tube, which goes directly into
  one of the faces of one of the city buildings." The slab, the tank, the
  two sheds, the panels and the mast still move as one piece; each of the
  five domes now has a spot of its own, turned so its porch door faces a
  branch point, a capped drum on the ground. A thin tube runs from every
  dome's door to the drum, and one trunk runs from the drum square into
  the middle of one wall of one shed (both sheds and five different walls
  get used). The sizes are taken from the art. A thin tube is square and
  a shade bigger than a dome's door, so it closes over it. The trunk is up
  to twice as wide and a little taller, but at most 85% of the wall's width
  and under the eave. It cannot simply be the art's tube made fatter: the
  art's tube is taller than a shed. Tubes have the art's tube colours, roof
  strip and ports, and run a little below the ground so they sit flush on
  the slab or off it. Every layout is checked before use: the trunk leaves
  through clear ground, no dome stands in another dome or a building, and
  no tube crosses a dome, a building or the trunk. The art's own four tubes
  are no longer drawn. The city is cut into its parts by a run list read
  off the art (`tools/port-sites.cjs`; the converter keeps the art's node
  order, checked on all six models), so nothing is guessed where a tube
  meets a porch. If no layout fits a port, the city goes whole, as the art
  laid it out, as before; on all six models every port tested found one.
  `test/city-sites.test.js`, 107 checks: every port joins its domes; every
  tube ends at its own dome's door, wherever that door has been turned to;
  the trunk is square to the wall, in the middle of it, fits it, stays
  under the eave and is thicker than the tubes; nothing crosses anything;
  and every corner of everything drawn stays off the pad, the runway's
  line and the doors.
  Same day, third pass: **the slab stands square to the site.** Astra:
  "the building that the domes connect to must be at a right angle to the
  other structures' walls; humans don't just put dotted lines on the
  ground to denote a square and then put a big four sided building at an
  angle to the lines." The slab, the tank, the sheds, the panels and the
  mast now turn only in quarter turns, so every wall runs with the pad's,
  the plates' and the markings'; the trunk leaves a shed wall square, so it
  runs with them too. The domes are round and keep any heading, and their
  tubes run where the domes are. All four quarter turns are used.
  `test/city-sites.test.js`, 113 checks.
- **2026-10-21: the comms channel fits a short window.** A port's ten
  options at a fixed 38 px a row printed over the traffic log in a short
  window, and the notes beside them ran off the right edge. The channel
  pane now takes the height its buttons need from the log first (the log
  keeps at least 96 px), the rows close up if that is still not enough,
  the footnote gives way when it is very tight, and every note is clipped
  to the pane, or left out if there is no room for a word of it.
- **2026-10-21: landing legs stand level, fold in half and pull up inside.**
  The hull converter (`tools/glb2hulls.js`) now brings every foot on a
  hull down to one level: the deepest foot, or 1% of a hull length under
  the lowest point of the hull if that is deeper. Legs are only ever
  lengthened, by sliding their lower half down the leg's own line. The
  heavy enforcer's nose leg grows about 6% of a hull length to match its
  rear legs, the runner's wing legs about 11% to match its nose leg, and
  the bulk hauler, courier and enforcer legs a little each so the feet
  clear the keel. Each leg is also cut at the knee: going up, the lower
  half folds back alongside the upper half, the folded pair pulls
  straight up into the hull, and then the bay door closes behind it
  (coming down is the same in reverse). The runner's wing is too thin to
  hold a leg, so its wing legs fold and then swing flat under the wing
  instead. No stowed leg reaches into a cockpit. Two new checks: every
  legged hull stands level, with its feet below its lowest point.
- **2026-10-21: survey instruments are graded by what they can see.**
  Astra: "a grade 1 scanner tells you where low grade minerals are, and
  grade 2 will tell you where fissiles are, and a grade 3 tells you where
  precious metals are."
  - **Grade 1, survey scanner** (6,400 cr): ores, water ice, hydrogen.
  - **Grade 2, gamma survey spectrometer** (new, 13,800 cr, development
    0.40 or better): adds fissiles.
  - **Grade 3, deep survey array** (23,500 cr): adds rare metals, and gives
    tonnes instead of words.
  - The SURVEY page lists only what an instrument of the right grade has
    mapped. It names the classes nobody has read ("not read - grade 2
    survey") whether or not anything is there, so the page never gives
    away which worlds hold fissiles.
  - The Guild pays for each commodity only on ground mapped by an
    instrument that reads it. Measured on one rich rocky world: about 660
    cr at grade 1, 3,030 at grade 2, 6,630 at grade 3. Flying sold ground
    again at a higher grade sells the newly read classes.
  - A drone digs the most valuable thing your survey has read, so a
    grade-1 survey keeps it on ore and ice.
- **2026-10-21: ship cuts tuned to the hulls' own seams** (ship-modules
  idea-stream). `tools/tune-cuts.cjs` moves each of Astra's cuts by at most
  4% to wherever it slices the least hull, and only when that slices at
  least 10% less than her line; it merges cuts that would leave a sliver
  under 4%, turns side cuts within 3% of the middle into one true centreline
  split, and drops cuts that would trim only the outermost 3%. 51 of 54
  ships changed (169 moves, 28 merges or drops). Her table is kept as
  `tools/ship-cuts-astra.json`. The chopper now makes a single plane for a
  centreline cut instead of two at the same place.
- **2026-10-16: the attitude ladder and bank scale are drawn sharp** under
  the glass glow. Measured on the RX 540: cockpit in a ring 22 > 40 fps,
  above it 37 > 51, in a belt field 26 > 40.
- **2026-10-16: rings do not bloom** (they mask alpha as bodies do).
- **2026-10-16: mining laser slowed** from about 7 s a chunk to about 11,
  because a rich rock out-earned a milfuel run, and the balance rule is
  that mining pays well but never beats active hauling.
- **2026-10-21: the loading screen says Manifest.** It said "PROCEDURAL
  SPACE GAME" in grey on black. It now shows the title card: the navy
  field, the eight-pointed compass rose and the Manifest wordmark, drawn
  from src/logo.js (now loaded first, before anything else), with the
  tagline and "loading". It fades into the title screen instead of
  blinking off.
- **2026-10-21: a new title card.** The wordmark is "Manifest" in Uncial
  Antiqua (chosen to suggest an epic voyage) in place of the Segoe
  Script, as outlines in src/logo.js. The navy is gone: the card is a
  starfield, with the wordmark above the compass rose rather than across
  it. On a wide window the logo has the left column and the menu sits on
  the right, with a box the menu's size under it telling one captain's
  rise (src/captains.js, twelve of them, a different one each launch and
  never the same twice running). Narrow windows stack the logo over the
  menu and leave the story out. The loading screen draws the same sky
  and logo in the same place from logo.js, and the title's first showing
  starts finished so the hand-over does not flicker. Tests: captains, 10
  checks; render 950/950.
- **2026-10-21: where the factory ships come apart.** tools/ship-cuts.json
  holds Astra's cuts for all 18 factory families at S, M and L: length
  cuts, deck cuts, and mirrored side cuts, as fractions of each hull. Set
  by eye in a cut editor (Claude outputs/ship-cuts-editor.cjs builds one
  page per size, real triangles from above and from the side, draggable
  lines). The carrier's conning tower is its cockpit, reached by lift.
  Groundwork for ship modules; nothing in the game reads it yet.
- **2026-10-21: the factory ships come apart (experiment, ship-modules
  branch).** tools/chop-ships.cjs cuts all 54 factory ships along Astra's
  cut table into modules: wings off whole as a mirrored pair, small parts
  kept whole in the cell their centre is in, hull shells sliced at the
  planes. Cells holding only a lamp or a bracket fold into the nearest
  piece of the same role, and a ship always keeps a fore and an aft piece
  (capital-l: 102 cells to 28 pieces; fighter-m: 23 to 20). Every pair of
  touching pieces records its joint. _ship-modules/view.html shows any ship
  pulled apart, drag to turn. Cut faces are still open; caps and standard
  sockets per size come next. Nothing in the game reads it yet.
- **2026-10-21: what a cut opens, a plate closes (ship-modules).** Where a
  cut slices one of a ship's solids, the outline it leaves on the plane is
  traced and filled: a wall at a length or side cut, a floor or ceiling at
  a deck cut, given to the pieces on both sides facing outward, in the
  part's own paint (capital-l: 1,718 plate triangles). Scraps are judged on
  the model's own geometry, not on the plates. The viewer can show the
  plates in yellow.
- **2026-10-21: round parts are pods (ship-modules).** A tank, bell or
  blister is never sliced by the cut grid: it becomes its own piece,
  trimmed once with a flat face (a fifth of its diameter) on the side where
  it meets the hull, and that face plated so it can mount on any hull
  piece; a dome's own flat side is its face. Round means a near-cube box
  with every vertex about the same distance from the centre (or a dome's),
  at least 6% of the ship's length across, and not a lamp, beacon, antenna
  tip, nozzle, engine, dish, nose or cockpit. Found on the couriers,
  shuttles, small trader, H2 freighters, tenders and tugs; smaller round
  parts stay whole inside their hull piece.
- **2026-10-21: plates are slabs, and every tank is a pod (ship-modules).**
  A plate was a sheet on the cut, so two joined pieces put two sheets in
  the same place and they fought for the pixels. Each plate is now a slab:
  outer face on the cut, inner face set back into its own piece (1% of the
  ship's length, at most a quarter of the part's own depth), walls round
  the edge. Pods' mounting faces too. The pod floor is 2.5% of the ship's
  length, not 6%: the same propellant tank is 3% of an L hull and 7% of an
  S, so a ratio alone made it a pod on one and not the other. Valves and
  sensor blisters stay with the hull by name. Propellant tanks are now pods
  on the freighters, liners, navy-l and enforcers as well.

- **The cockpit scales as one piece, and the bulkhead moved aft
  (2026-10-24).** Part of the ship-interiors work above.
  - **The scaling fix.** Before, the glass and screens grew with a hull's
    size but the consoles, overhead, bulkhead and dash were fixed at the
    Talon's. On a Mule the side windows sat outside its own consoles and
    the dash stopped well short of the windscreen. Now:
    - the room scales across and up with the hull, and fore and aft with
      the windscreen's real distance;
    - the dash runs from its near edge to the sill.
    The Talon is unchanged.
  - **Small hulls' dash screens are inside the glass now.** On a Dart,
    Fighter or Wren they stood past the windscreen, which the flat cockpit
    hid. They are drawn in toward the eye, scaled about it, so from the
    seat they look exactly the size they did.
  - **The rear bulkhead is 1.3 m behind the eye (it was 0.5 m)**, so there
    is room to stand and a door to walk through. The two rear screens sit
    either side of the door and are a third bigger. The bulkhead's greebles
    keep clear of the door and both screens.
  - **O stands you up in your own ship** instead of on the station deck.
    The station deck is through your airlock.
  - *Tests:*
    - new `test/shipdeck.test.js` (35 checks), now in `npm test`;
    - `test/greebles.test.js` checks each hull's fittings against that
      hull's own walls, not one fixed Talon-sized box, and checks nothing
      is mounted on the door (14);
    - `walk.js`: a shut sliding door is wall, and E only reaches things in
      the room you stand in.

- **No more force fields: every station that had one has sliding doors
  now (2026-10-20).** Astra: *"air locks to keep stations pressurized
  (let's get rid of the force fields)"*.
  - **Which stations:** 24 of the 96 station models still sealed a bay
    with a force field. They are every refinery and skimmer station and
    the mountain, runway and runway-city ground sites. The other 72
    already had real doors.
  - **What replaces each field:** a pair of door leaves, cut to the
    field's own size. They split down the long side of the opening, with
    a hazard stripe on the meeting edge, and slide apart until the
    opening is clear.
  - **They behave like real doors:** you can hit them where they stand,
    and they open in the same airlock cycle the berth already runs
    (outer gate, then inner, never both).
  - **Internal gates:** two gates inside the big skimmers stand at right
    angles to their berth. They became internal doors that open with the
    station, like the cradle's lift-well gate.
  - **Roll-up garage slats at the yards are unchanged.**
  - `berths.test.js` now fails if any force field survives anywhere.
  - Station modules drawn from your generator will bring their own
    airlocks.

- **Milfuel shelves hold at most 18 t, down from 24 (2026-10-19).** Twilight
  worlds settled more of the galaxy, so licensed plants made more. The
  best single slug run in the economy suite reached 127,711 cr, more than
  a Kestrel, which is exactly what the shelf cap exists to stop. At 18 t
  the median run is back to what it was before twilight worlds (80,564 cr
  against 78,780) and the best is 95,783.

- **Small bays reached through a heavy bay cycle an airlock first
  (2026-10-17).** In to the heavy bay's stand, the outer doors close, *then*
  the inner gate opens, then on through the hull — the hull used to carry
  straight on through a gate that had not opened. At the ring this is the
  whole way down: stand, hatch, down the well onto the lift, ridden down
  the shaft, a beat on the pad, and rolled off level along the spoke deck
  (the converter's route corner hung ~150 m up in the spoke and made the
  hull hop). Bays with no lift skip the ride legs and take no extra time.

### Fixed

- **A ship adrift stays adrift when you rob or hail her (2026-10-30).** Robbing
  her, or anything else that takes her off her timetable, used to hand her a
  working drive: she would run like any other trader.
  - Now she keeps her dead tank. She coasts under gravity with her slow tumble
    (`Sim.steerNpc`, `spec.adrift` from `Combat.liftTrader`), and stays on the
    distress band, her beacon wherever she drifts.
  - Passing her mass works on her where she actually is, and gives her a drive
    again.
  - "Lock her up" finds her by the right id.
  - Asking her aboard gets *"We would, if we could make way. Pass us some mass
    and ask again."*
  - The comms header no longer reads "0 m out" under a distress call or a
    traffic-control frequency.
  - **Seen in the game** (`Claude outputs/probe-rescue.js`, muted). At Mirven,
    the Mirefast Drover's tank let go:
    - her call was on the band and her transponder checked out;
    - one pass from a hold short of hydrogen left her needing 0.8 t more;
    - a second pass finished it, she paid 1,370 cr, her call came off the
      band, and she lit up and flew off;
    - the Tallow Runner, robbed while adrift, stayed exactly where her rail's
      drift has her (0.000 km) with her throttle at zero, still calling.
  - `upkeep.test.js` (58 checks) covers: asked aboard, robbed, still calling,
    and fuelled while lifted.

- **Container lettering read backwards (2026-10-30).** Astra: *"'Hydrogen
  Fuel' letters are backwards, ensure lettering always reads correctly no
  matter what side of the hull the cargo is on."*
  - The cause: the deck's frame is left-handed as the game draws it (your
    right is up × forward). The containers were laid out in the design sheet's
    right-handed axes, so every strip and pictogram came out mirrored.
  - The fix: `cargokit.js faceFrame` now runs each face's reading direction
    along normal × up. A container's turn is a pure rotation, so this fixes
    both walls of the hold at once.
  - Checked in the game on a container on each wall, and by a test that holds
    every face (front, side, lid) on both walls against the walker's own
    right.

- **Her hold, her screens, her crates (2026-10-30).** Astra: *"widen the
  hold, and make sure that the panels on the ship we're boarding display
  that ship's information. Make sure that the boxes in the hold are
  representative of what is actually in the hold."*
  - **Widened.** A ship bigger than her hull's fitted length has her hold
    widened to her own beam: measured against her model down the whole
    bay, at floor and ceiling, a metre clear of her skin, the way
    `tools/fit-hulls.js` measures rooms. The Pilgrim Barge's went from
    about 4 m wide to 11.9 m. Extra rows of crates go inboard of the wall
    rows, with a 1.8 m aisle kept clear down the middle.
  - **Her screens show her.** Aboard her, her bridge displays were
    drawing your credits, tanks and hold. They now show her: her name and
    hull where your money was, her hull's tanks (full: the game does not
    track an NPC's fuel), her manifest in her hold, against her hold's
    real size. Her own aft screen no longer lists her as its nearest
    contact. Your ship's screens are unchanged.
  - **The crates are her cargo.** Every line of the manifest gets its
    own stacks, at least one however small (two tonnes of medicine among
    300 t of waste used to round away to nothing), and a stack holds only
    one cargo. Facing a crate now says what is in it and how much
    ("Radioactive waste · 20 t"); the stacks of a line add up to the
    tonnes on the manifest. The hold fills from the door, as the old
    comment always said, so a half-empty hold no longer looks like an
    empty corridor from its door. Her hold's capacity grows with its
    floor (a 108 m hauler holds about 7,000 t), so the stacks are true to
    how full she is: the Pilgrim Barge's 78 t of waste is three stacks.
  - `test/boarding.test.js`: the widened hold, every crate inside it,
    every manifest line represented, the labels adding up, the bigger
    capacity. 50 checks.
- **A ship was far smaller inside than outside (2026-10-29).** Ships in
  space are drawn at their route's size, 1.4 to 4.5 times their hull's
  fitted length: the Pilgrim Barge is about 100 m long outside and was a
  31 m ship once you were aboard. Astra: *"we'll increase the ship size
  so that the hull interior makes sense"*, and, asked, each ship her own
  size.
  - A ship you board is as long inside as she is drawn outside. Her
    cockpit sits at the same point of her model, and her hold (or, on a
    small ship with no hold, her passage) runs on aft to fill the extra.
    The Pilgrim Barge, drawn at 108 m, now has a 46 m hold.
  - Her other rooms, her crew and her ramp are as before.
  - Hulls you fly are unchanged.
  - The ships-alongside layout and her hatch position use the same
    length, so the tube still meets her ramp.
  - `test/boarding.test.js`: every traffic hull at three times her length
    has the same rooms, a longer hold, her cockpit scaled with her, and
    nothing reaching further aft in her model than before.
- **Ships met nose to nose, with a Talon half inside a hauler (2026-10-29).**
  Astra: *"why are the ships coming together nose to nose?"* She aimed at
  a point 30 m from your centre, kept her nose wherever her approach had
  left it, and the tube ran centre to centre. Asked how they should lie,
  Astra said *"it should be ship dependent"*, so now:
  - **Two hulls of a size** (neither more than 1.6 times the other's
    length) lie **belly to belly**: she comes in beneath you upside down
    and the tube runs straight between the two ramps.
  - **A big ship and a small one** lie **side by side**, level and facing
    the same way, on your hatch's side. The tube drops out of her belly,
    runs across underneath, and rises into yours.
  - The gap comes from both hulls' shapes (`Render.hatchModel`: each
    ramp's mouth on the belly, and the box each hull fills), so they
    never overlap.
  - She points where her drive pushes: at you on the way in, engines
    first while braking, and turns to her final attitude in the last
    300 m. The tube connects only when she is within 5 m of her place and
    lying the right way.
  - The tube is a metre in radius whatever its length (it used to fatten
    with the gap).
  - Measured by `tools/probe-tube.js`: a Talon and a 97 m waste hauler
    side by side, 44 m of tube; a Meridian and a 108 m hauler belly to
    belly, her up exactly opposite yours, 29.5 m of tube.
- **Her drives burned flat out while she sat alongside (2026-10-29).** Once
  joined she was still steering toward your pinned position from a frame
  back, so she braked at full thrust every frame, which showed as lit
  plumes and slowly took her off her orbit. Joined, she now just coasts
  under gravity with her throttle at zero.
- **Her master was asked "Does your captain owe me anything?"** She is
  the captain. She is now asked "Do you owe me anything?" and answers for
  herself.
- **A ship asked alongside hovered about 1 km out (2026-10-29).** Astra:
  *"it is still hovering out about 1km in distance."* Her steering ran
  after your ship had already moved that frame, but she moved only after
  steering, so she always settled one frame of travel ahead of her aim.
  At 55 km/s and 60 fps that is 0.92 km. She now catches up to the same
  moment first, then steers. The same ordering held you a frame behind
  her once the tube was joined, so you are now pinned to her after she
  has moved, not before. Measured: she closes from 7.7 km and the tube
  joins at 30.0 m in 33 s, and holds there.
- **The contacts box said a ship you asked aboard was "fleeing".** It
  now says "coming alongside", "running her tube out", then "tube made
  fast".
- **The FLIGHT panel ran out of its frame.** RET was cut off by the left
  edge, PRO ran into the fuel bars, and the thruster burn time ran off
  the right. The burn rose is smaller, the bars start further right, and
  each figure (light-years, burn time) is right-aligned against its label;
  if a figure will not fit, it is dropped and the bar still shows it.
- **Landing gear hung out through its own shut doors (2026-10-29).** Astra,
  flying a Talon: *"there's something wrong with the landing gear doors."*
  The doors closed flush, but every hull's legs stowed 0.2–0.6 m short of
  folding away, so they poked down through the doors in flight.
  - `render.js` now measures each leg's stow angle against the hull's own
    belly over its bay, once per model: it turns the leg further the same
    way until it is inside, or the other way round if that is the only
    way it fits. Doors are left as they were.
  - A new render test says nothing hangs below the belly with the gear up,
    on every rigged hull.
- **No way in showed on her belly (2026-10-29).** *"I don't see where there
  could be a ramp to get in and out of the ship."*
  - The ramp and its bay were only drawn once the airlock had been used
    at least once. Your ship now has her airlock from the first frame.
  - With the ramp up, the well was an open dark hole: the ramp stows at
    deck height, above the skin. Two door leaves, painted the colour of
    the skin they replace, now close it flush with the belly. They slide
    apart in the first part of the ramp's travel.
  - Hazard stripes round every ramp (*"we need to put hazard stripes
    around the ramp ... around all ramps like it"*): a band about a
    quarter-metre wide of yellow and black at 45°, on all four sides of
    the opening, on every hull that has a ramp. It stays there with the
    ramp down as well as up.
- **Standing up in flight did nothing (2026-10-29).** *"standing up from my
  station doesn't work."* O only worked docked or landed. Now it works in
  flight too (not in hyperspace). Astra chose that the ship holds while
  you are up:
  - A pilot in your crew takes the helm and keeps whatever the autopilot
    was doing. E at the seat (or at her, sitting in it) takes it back.
  - With no pilot she coasts: the autopilots stand down, cruise drops out,
    and the controls stay locked until you sit down again.
  - Time compression drops to real time when you stand.
  - The outer door stays sealed in flight.
- **A ship's crew size came from a fraction (2026-10-28).**
  `crewForShip` compared a route's `size` (a mass fraction, e.g. 0.09) to
  'L' and 'M', so every ship in port was crewed like an S, with two
  souls. It now takes the size letter from her hull: three for an M,
  five for an L or XL. The concourse is a little busier for it.
- **The hand working a berth stood in front of its hatch.** E facing the
  hatch found the hand first, so you could talk to her crew but never
  get aboard her. They stand two metres or more along the wall now.
- **Her master refused to trade with you from his own deck** as "out of
  transmitter range". A traffic contact is one frame's rail position,
  and a moored ship rides her station round its orbit at tens of km/s,
  so a contact held from the moment you boarded was a hundred km away
  seconds later. Her contact is looked up fresh every time it's asked.

- **The station vanished round a berthed ship, and the cutaway with it
  (2026-10-26).** Astra: "what happened to our station cutaway for ships
  which are inside stations?" The berths sit at or just past a station's
  `radius` (Waypoint Dock: r 4.18 km, berth 4.36 km from the centre), so
  the "camera inside the bounding sphere" test failed. The centre then fell
  behind the eye and the whole station was culled: the ship sat alone in
  black space, and the cutaway had nothing to cut. The station the hull is
  in (`enclosedPort()`) now always counts as enclosing (`main.js`, the body
  list in the world draw).
  - **The cut edge is a double orange line with black between** (Astra: "a
    less busy, but still nicely convincing double orange line, with black
    in between them"). The capped band is split in thirds: orange, black,
    orange (`gl.js` FRAG_MESH). The band is skipped where the cut runs
    *along* a surface, like a floor lying along the line of sight, so it
    doesn't leave long orange slivers converging on the ship. That check
    came from the unmerged `cutaway-test` build.

- **A landed ship couldn't take off (2026-10-26).** `landed` was never
  cleared, so throttling up did nothing. Now, once landed, she settles
  onto the surface (upright, gear on the ground, turning with the world).
  She lifts off when the vertical thrust beats gravity by 2%, as long as
  nobody is walking aboard. She won't lift off with the ramp down: "The
  ramp is not up".
- **2026-10-16: contracts never settled after a full arrival.** Two
  dock-edge detectors shared one flag and the first one consumed it.
- **2026-10-16: station flicker.** Station vertices were rounded to a
  4 m grid on a 4 km station, crushing panels and thin walls into
  coplanar faces (cradle-s: 13,871 coplanar pairs, now 8).
- **2026-10-16: 45-degree bores poked through the hull.** They are clipped
  flush at the wall.
- **2026-10-17: scanner audit.** Astra asked for the scanners to be
  checked for bugs. Found and fixed:
  - **Low orbits left holes in a survey.** Below about 1.1 radii the swath
    is narrower than half a cell, so a diagonal ground track could run
    between cell centres and leave a chequerboard of unmapped ground it
    had flown straight over. A cell now counts once the swath reaches into
    it.
  - **One fresh cell made an old survey sell as new.** Value aged off the
    last time any ground was gained. It now ages off the coverage-weighted
    date of the unsold ground; the page's "as of" still shows the last
    pass.
  - **One deep-array cell made a whole scanner survey sell at array
    price.** Each survey now records how much of it each instrument
    mapped: the array's share sells at the full rate, the scanner's at
    0.6.
  - **The SURVEY page showed tonnages for ground only the scanner had
    mapped** as soon as an array was fitted. Tonnes now show only once the
    array itself has mapped a tenth of the world; otherwise grade words.
  - **The nav page's "carrying" row disagreed with the ship's hold.** A
    trader you had just robbed still showed a full hold, and a pirate full
    of other people's cargo showed nothing. It reads the same hold that
    robbery and wrecks use now.
  - **The trade analyser could start a run at an empty warehouse.** Runs
    now start only where there is at least a tonne to load.
  - Checked and found sound: the survey spin frame agrees with the ground
    frame that ports and drones use. A survey stalling at 16% round
    Mirven II a was the test orbit, not the scanner: that moon's Hill
    sphere is only about 2.2 radii, so small moons close to big planets
    can only be mapped on close passes, not orbited.

- **2026-10-18: a rock shattered at one star also vanished at others.**
  Rock state was kept by rock id alone, and ring-rock ids repeat from
  system to system. It is kept per system now; older saves' entries still
  count, so nothing a torpedo took comes back.

- **Work that had been committed went missing from the working copy
  (2026-10-19).** Two lines of work split on 2026-10-15: Driftwood on one
  branch, the 1.1.0-beta "Abby" release on another. The working copy had
  lost parts of both. Restored by three-way merge, without touching
  anything done since:
  - **From Driftwood:**
    - planetary rings drawn by their own shader;
    - cockpit greebles and the glass glow;
    - refusing to undock inside a station;
    - a crash counted as a loss;
    - culling small moons;
    - the belt chart;
    - the hull-import fix for lift shafts;
    - test probes that never touch your real career (they run in a
      throwaway profile) and the crash log.
  - **From Abby:** the release name and number in `package.json`
    (1.1.0-beta "Abby"), `src/release.js` loaded on the page, the
    Manifest names for the installers, and Abby's own section in this
    file. Everything written after Abby was cut was moved up here into
    Unreleased.
  The rings, greebles and release suites pass again. The branches
  themselves still need reconciling in git.
- **A holding's first nudge could move a system's crime score by one
  too many (2026-10-19).** The galaxy works the score out before rounding
  a government's two axes. A holding then re-ran the formula on the
  rounded ones, so in about one system in six the first change jumped by
  an extra point. It now adds its change to the system's own score.

- **Crossing a system took half an hour (2026-10-19).** Astra: "That gas
  giant is 27 minutes flight time from Mirven I, even at 6 times c", and
  in her Talon "the fastest speed allowed, even between planets, was
  6.7c". The cruise drive was capped at 2.0e6 km/s for every ship.
  - **The cap:** now the drive's own ceiling (see *Cruise drives come in
    classes*). The global constant stays only as a 20,000c guard rail.
  - **Engaging:** the drive now engages on **full**, following the mass
    lock up and down. `,` takes it off full; `.` up to the limit puts it
    back on.
  - **Arriving:** with full on, the arrival look-ahead is 0.5 s instead of
    2.5 s. At 2.5 s it dropped you out 23 million km short of Beta
    Mirven VII.
  - **Fuel:** reaction mass per km is cut from 1.1e-8 to 1.5e-9 t. At the
    old rate a 20 AU crossing would have burned twice a full tank.
  - **Measured at the 2000c cap** (before drive classes): Linethor I to
    XI, 42 AU, in 64 s; Beta Mirven I to VII in 46 s.

- **Slipspace drops you well outside the habitable zone (2026-10-19).**
  Astra: jumps "should dump you not close to the HZ, but a ways out".
  - **Where:** you arrive in orbit about the star, on the line to the
    busiest world.
  - **How far:** the furthest of three: the frost line, 1.6 × the habitable
    zone's outer edge, or 1.25 × that world's distance.
  - **On arrival:** nose on the world, the world locked, the camera on
    the ship.
  - In Taost that was 1.32 AU out, with the world at 0.33 AU.

- **Clouds stood still over tidally locked worlds (2026-10-19).** The
  cloud deck turned at a multiple of the world's day, and a locked world's
  day is its year. Past four days the deck now runs on a nominal 30-hour
  circulation. Found by `weather.test.js`, whose wettest pad had landed on
  a ring world.

- **Arriving at a world whose only port is a pad crashed (2026-10-19).**
  enterSystem read the pad's orbit for the camera distance. Found by the
  first corridor jump into a twilight system.

- **A new game could crash spawning over a world whose first port was a
  pad (2026-10-19).** The spawn picked `children[0]` of any kind and read
  its orbit. A ground pad has no orbit. It now picks the first ORBITAL
  station, and spawnShip ignores a pad if one is handed to it anyway.
  Twilight worlds hit this every time: their old pad comes before the
  stations added for them.

- **Cockpit panels overlapped (2026-10-19).** Astra: "panels overlap.
  This is a problem." Three separate overlaps, all fixed:
  - *The dash screens overlapped each other*, by 43 to 138 px between
    housings at every window size, worst on the smallest hulls. The
    mounting comment claimed the arc was 28° with a degree to spare; the
    mounts were at 24° and the housings were never counted. Now ±28° with
    the screens 6% smaller, and small cockpits shrink their screens with
    the room instead of more slowly than it. Worst case now ~21 px clear.
    The cockpit suite checks neighbours against each other at six window
    shapes and three cockpit sizes (36 new checks), so it cannot drift back.
  - *The help hints ran across the ORBIT screen.* With the band stowed and
    the console showing, both hint lines move to the top-left corner.
  - *The icon bar sat on the bottom of the screens.* With the band stowed,
    the cockpit view is now built for the window above the bar rather than
    the whole window, so the console sits above it. The GPU layer projects
    through the same camera, so the world stays in register.
  - The NAV contacts list ran ship names into their distances on a narrow
    window ("Coldwater Drove38,606 km"); names are now clipped to the room
    the distance leaves.
  - On a narrow window F3's pages shrank to half a column at 7 px type;
    with no room for the scope beside them they now take the full column.
  - The AUTOPILOT page's last line ("mass locked by …") ran 7 px into its
    own soft-key strip; the column is packed to end inside the page.

- **Flat orbits were drawn rotated (2026-10-19).** An orbit lying in the
  system plane, which is most of them, has no node line, and
  `Kepler.elementsFromState` then left the argument of periapsis at 0: the
  ellipse had the right shape but its periapsis pointed along +X wherever
  it really was, so the line could miss the ship by thousands of km. Found
  by the new orbit-line test. Flat orbits now keep their periapsis
  (retrograde ones measured the other way), and "no node line" is judged
  relative to the angular momentum, not against an absolute 1e-9 that
  rounding noise could pass.

- **A save taken in cruise loaded at 6.7c (2026-10-19).** Inside the
  cruise bubble the hull's velocity is the cruise speed, up to 2,000,000
  km/s, and the save did not know about cruise: it wrote that velocity
  down, and loading dropped you into ordinary flight at it with no bubble
  and no way to slow. A save in cruise is now written as the drop-out
  would leave you, in the circular orbit you are standing in, and an
  older save carrying a frozen cruise velocity (anything over 15,000 km/s
  relative to the nearest body) is repaired the same way on load.

- **Contracts never completed on arrival (2026-10-17).** Astra: *"missions
  still don't auto-clear when you arrive at the mission destination."* Two
  things wait for the docking moment — the arrival desk and the contracts
  — and the desk marked it handled first, so the contracts always saw "not
  just docked". Read once now, and both get it. The same dead branch held
  the clamp sound and the autosave on docking, which now happen too. A
  render-suite test flies the real frame loop through it.

- **Docking at a ring's heavy bay could crash (2026-10-17).** Leg timings
  were cached per station off berth 0's path, and a ring's berth 0 is a
  routed small bay — so the heavy bay was handed the long routed table and
  read off the end of its own short path. Cached per berth and per model now,
  and a mismatch returns no pose instead of throwing.

- **Ships flew through the ring's lift shaft wall (2026-10-17).** The route
  to a small bay ran diagonally from the heavy bay's stand to the foot of the
  lift, through the closed inner gate and the shaft wall. It now goes
  straight down the shaft (see Changed).

- **The world analysis sheet printed a gas giant's atmosphere over its own
  label (2026-10-17).** Long values in the star chart's two-column rows now
  wrap onto right-aligned continuation lines, and the text below moves down
  to fit.

### Saves

- `notes` (string) and `journal` (array) are new, and additive. An older save
  loads with an empty notepad and an empty log; nothing is invented for it.

Careers carry over. Everything new (surveys, claims, drones, the landed
spot, shattered rocks, torpedo refunds, sabotage) is additive and loads as
"nothing yet" on an older save. A survey made before the scanner audit
keeps exactly the value it had: its ground counts as mapped by the
instrument its grade says. A survey taken with the deep array before
2026-10-21 counts as grade 3 and is worth what it was. One taken with the
scanner now reads ore, ice and hydrogen only, so an unsold scanner survey
of a world with fissiles or rare metals is worth less than it was.
A city site's town is placed from the port itself, not from the save, so
an older career sees it in its new place the next time it lands there.

- **Careers load unchanged.**
  - A Crawler's livery is new and optional (`livery`, `liveryFaction` on
    the ship and on fleet records); an older career's Crawler loads
    civilian, which it was.
  - Walking aboard is not saved, any more than walking a station is: a
    load puts you back in the seat.
  - The people (2026-10-25) are not saved either. Who is where is worked
    out from the roster, the port and the clock, so a load finds the same
    people at the same posts without storing any of them.

  - The airlock (2026-10-26) is not saved either: a load finds her
    sealed, ramp up. A career saved while landed loads landed and settles
    onto the surface as before.
  - Who you have paid and who you have refused (`tithe`, by system) is
    saved. An older career owes nobody anything.

---

## 1.1.0-beta "Abby" (2026-10-15)

**Releases have names now** as well as numbers, the way Linux distributions
do. They are pigeons from the rescue, in no fixed order. This one is named
for Abby, a PMV survivor. The name is on the title screen, in the window
title and in `src/release.js`; `test/release.test.js` keeps it and the
number in step with `package.json`.

This section was opened for alpha 5 and never closed for 1.0.0-beta
(2026-09-16), so everything below, down to "Before this changelog", shipped
in Abby. Since 1.0: crew and a fleet, weather you fly through, two rescue
services with a bill and a hull lien, standing orders, analysers and
rumours, ship-to-ship trade, industry you can buy into, milfuel works, the
Syndicate's fleet and its runners, and the station cutaway and glow pass.

### Fixed (release housekeeping)

- **The game was being built as "Procedural Space Game" 0.1.0 again.** A
  commit on 2026-09-16 restored an old `package.json` and undid the rename,
  so every build after 1.0 carried the old name, and a build under the old
  name looks for saves in the old folder. The Manifest name, appId, artifact
  names, desktop entry and maintainer are back.
- **The rescue test still expected a flat fee that was waived when you were
  broke.** Since the tow-and-bill change the fee is quoted at dispatch and
  any shortfall becomes a lien on the hull. The test now checks that.

### Saves

Careers carry over. The `game://` origin and the `%APPDATA%\Manifest`
folder are unchanged, and `electron/main.js` still copies saves across from
the old name if it finds them there instead.

### Everything else since alpha 4


Outfitting, weapons, and the law. See `PLAN.md` for the
full design and the phases still outstanding.

### Added

- **Cruise speed reads in c.** `0.412c`, `3.10c` on the console and the
  autopilot page, for the cruise speed and the mass-lock limit. Below a
  thousandth of c the old km/s readout carries on.

- **Trading with a ship you have hailed is a proper market now.** `F4` →
  pick a ship → `Trade…` opens a board in the channel pane: every line in
  their hold and every line in yours, what they ask and what they pay, and
  — for the selected line — what each direction would do or why it will
  not. The keys are the port market's (↑↓, → buy, ← sell, Shift ×10, Home
  buy max, End sell all); Esc backs out to the channel. It replaces the two
  one-line buttons, which offered the first line of the manifest, six
  tonnes at a time, at a flat markup, to anyone.

  Who you are matters now, as Astra designed it:
  - **The record gates lawful hulls only.** Wanted by a ship's own flag, or
    a fugitive from it, and it will not open its hold to you — and says
    why, and what would change it. Outlaw hulls deal with anybody.
  - **Standing moves the price**, up to 12% either way, never the door.
  - **Standing rises with the size of the deal** — a point per 2,500 cr,
    fractions carried, at most four points a faction a day.
  - **Rivals resent it.** Galaxies now carry seeded rivalries between the
    empires (`Galaxy.rivalsOf`). Trading with a rival empire's hull in an
    empire's space costs you with that empire; trading with a lawful hull
    in a Syndicate hold costs you with the Syndicate, and an outlaw hull in
    lawful space with the owner. The board says who will mind *before* you
    trade.

  Prices are anchored to what the good is worth at the ship's destination,
  so at the best standing a ship still asks more and bids less than the
  port it is bound for: a convenience and a way to buy friends, never an
  arbitrage. A swept test holds every two-way line in a dozen systems to
  ask-above-bid.

- **Syndicate runners work the black markets of lawful space.** Before
  them, 2,000 sampled systems put an outlaw-flagged trader in lawful space
  exactly zero times, so "dealing with an outlaw hull costs you with the
  owner" could never happen. Astra: *"pirates are always trying to get
  more."* Now a route touching a black-market port may fly the Syndicate's
  flag instead of its home port's — odds rising with the system's crime
  score — and the comms list marks it **Syndicate runner**. About 3% of
  lawful traffic; at least one in 77% of lawful systems, median four. A
  runner will deal with a pilot the local law wants, will buy your
  contraband, and costs you standing with whoever owns the space.

  It is a relabel, not new ships: the route keeps its manifest, timetable
  and hull. Manifests are scheduled deliveries to port markets, so new
  cargo would have moved prices in every existing seed.

- **The game asks for the discrete GPU.** The WebGL layer requested the
  `low-power` adapter, which on a dual-GPU laptop like the Latitude 5424 is
  an explicit request for the integrated chip. It asks for
  `high-performance` now, Electron forces the same at process level, and
  `GLWorld.adapter` records which chip actually answered.

- **Distress calls are signals now, not a bounty timer.** `distressAt` has
  existed since the law did, and the word had been a lie for the whole life
  of the codebase: the timer expired, `report()` added a bounty, and
  nothing in the universe had heard anything. No line, no position, no
  responder, no way to answer one.

  A call is an entry in `G.distress` carrying who is transmitting, their
  registration, where they are, what is happening to them, and when the
  transmission lapses. The comms list reads that list directly rather than
  keeping a copy in step with it, so a line on the panel cannot outlive the
  call it describes — Phase 13's rule (*every line must be true*) enforced
  by there being one account of the truth.

  **You can transmit your own, and choose what you are asking for.** A fuel
  tender or security — two genuinely different services that do not
  substitute for one another, so asking the wrong one is a real mistake the
  game lets you make. The emergency itself is read off the ship rather than
  chosen from a menu: out of reaction mass, hull critical, out of jump fuel.

  **This closes a real dead end.** Running the reaction mass out used to
  print *"Docking refills it free"* to a pilot with no thrust, naming the
  one exit and pointing at a door they could no longer reach. It now points
  at the exit that exists from where they are.

  **Two things the arithmetic caught during the build:**

  The first version gave every call a 90-second life. The nearest patrol
  in the test system was **34.7 million km away — eighteen honest hours**
  at a cutter's real acceleration — so the beacon would have lapsed while
  the answer was still accelerating: the dead end again, wearing a rescue's
  clothes. A mayday now transmits until the responder arrives; a squawk
  about a fight still goes stale in ninety seconds, because news does.

  And storing the rescue witness as `vouchesFor = t` was a trap, because
  `t` is 0 at the start of a career: the first rescue you ever performed
  would have read as no rescue at all everywhere downstream. It is an
  object now.

  **`steerNpc` learned to fly somewhere that is not the player.** Every
  mode it had steered relative to the player's ship, which is exactly the
  assumption that stops a cutter answering a robbery happening elsewhere.
  Responders are given a position. Today that position is always near the
  player — `damageNpc` has no caller but the player's own guns, so no NPC
  can attack another NPC — but writing it as a place rather than a synonym
  for `ship` is what Phase 9 will need, and a shortcut would have had to be
  undone.

  **Answering somebody else's call is built, tested and dormant** for that
  same reason: there is no third-party victim to rescue yet. It credits
  standing with the victim's flag and makes the rescued ship a witness
  *for* you, spending systems that already exist rather than inventing a
  currency.

- **Lightning keeps weather now, not time.** Astra: it should flash "at a
  more random-looking pace", and "look more like a real storm".

  What was wrong was a metronome. Time was cut into fixed 0.9 s slots and
  every stroke began at the top of its slot, so however many cells fired and
  however hard, the sky kept a perfect 0.9 s beat — a strobe with a storm
  texture on it. Three changes, each of them something real lightning does:
  strokes slide anywhere inside their slot; the previous slot is evaluated
  too, so a late stroke finishes instead of being guillotined at the
  boundary; and each cell's firing threshold is modulated by four slow
  rhythms, so storms burst and then go quiet rather than ticking over. A
  flash is also two or three strokes at hashed gaps instead of a fixed
  fifth of a slot, which is most of what the eye reads as lightning rather
  than as a lamp being switched.

  **Measured, because "looks real" is a claim about numbers.** The gaps
  between flashes in one cell now run 0.72 s at the tenth percentile, 2.3 s
  median, 7.2 s at p90 and up to 31 s, with a coefficient of variation of
  **1.01** — a metronome is 0 and a Poisson process is 1, and real
  inter-flash intervals are very close to exponential. Gaps landing within
  50 ms of a whole slot fell to 12.5% against 11% expected by chance, which
  is the beat being gone rather than disguised.

  **It repeats on purpose, and the number is written down.** The four
  rhythms are 419, 557, 683 and 811 slots — 6 to 12 minutes, which is how
  long a cell actually takes to wax and wane — and they are pairwise
  co-prime, so they realign only after their product: 1.293e11 slots, about
  **3,700 years of sim time**. Astra asked for a pattern that eventually
  repeats and cannot be caught repeating.

  The schedule lives in `weather.js` with every other weather number, so the
  suite checks the pace without a GPU and the two languages cannot drift.

  **And a latent bug found on the way.** The old salt multiplied the slot
  index by 374761393 in a double while claiming to be exact "for any bucket
  a career will ever reach". It left 2^53 after roughly eight months of sim
  time and began dropping low bits — the storms would have gone quietly
  periodic, which is the exact failure that function exists to prevent,
  hiding inside the function. It is `Math.imul` now and exact for every slot
  in the cycle.

- **The tow, the bill, and what happens when you cannot pay it.** The
  tender arrived and filled your tanks for a flat 500 cr, and if you were
  broke the crew waived it. Three things were wrong with that: there was
  only one service, the price did not depend on who was doing the work, and
  the waiver quietly made the whole fee optional — fly out broke, run dry,
  get filled for nothing. A rescue you can farm is not a punishment.

  **Two services, and you pick.** A transfer fills the tanks where you
  float and leaves you exactly where your mistake left you. A tow hauls you
  and your hull to a port you choose, and it is the only one of the two that
  answers a dead hull or a decaying orbit. Agreed over COMMS while the boat
  is still inbound, because the quote is a fact about the *call* — a crew
  that named a price and then re-quoted once you picked somewhere far away
  would be running the oldest trick there is.

  **Who answers sets the rate.** A port tug is a business: call-out, crew
  hours, and a rate on your all-up mass. A faction navy tender is free,
  because a warship's boat exists to pull people out of the dark — but
  waste one and it costs you standing, which is the right currency, since
  what you spent was their goodwill. The Syndicate charges three times a
  harbour's rate plus a quarter of what your hold is worth, and it reads
  your manifest before it quotes. The quote is the threat.

  **A rescue you cannot pay for becomes a lien on the hull.** Every sale
  gives up 20% until it clears, and the yard will not fit or trade an
  encumbered ship — with the reason said out loud, which is the rule
  `canFit` has always followed. Cargo trade, fuel, repairs and consumables
  stay open deliberately: the one activity that clears the debt is always
  available, so a bill can never become a soft game over. Astra's reason for
  choosing it over impound or confiscation was that it leaves room for a
  story, and it does — you keep flying, you just fly for the harbour for a
  while. It reuses the instrument unpaid berthing already runs on rather
  than inventing a second kind of debt.

  **Priced on crew hours, and the measurement is the whole design.**
  Distance to the nearest boat across forty seeds, sampled from every port:
  median 43 Mkm, p90 694 Mkm, worst 4,779 Mkm — and ~0 at the first
  quartile, because tugs live *at* ports. A linear rate over a spread that
  wide is unusable: at a mere 20 cr/Mkm the worst case bills 95,574 cr
  against a median full-hold sale of 4,898 cr, which is a debt that can
  never be cleared. So the bill is the tug's *hours*, using the same
  brachistochrone the rescue already flew — sublinear by construction.
  Measured at 26.7 crew hours median, 106.7 at p90, 280.1 at worst; at
  25 cr/h over a 500 cr call-out that is 1,167 cr median, 3,169 at p90 and
  7,502 for the worst tow in the galaxy. One to eight sales under the lien.
  Felt every time, fatal never.

  The lien's cut is a percentage for the same reason: a full hold grosses
  704 cr at the tenth percentile and 340,726 cr at the top, and any flat
  deduction across that is either beneath notice or confiscation.

  **The cable is a rail that hands off to the arrival.** Nothing about being
  dragged on a cable is interesting to integrate, and a 280-hour tow
  integrated accurately is tens of millions of frames — so the hull is
  placed where a tug flying a brachistochrone would have put it, on a
  smoothstep so the cable comes taut instead of snapping, with `vel` set
  from the same curve because the speed tape reads it. It ends by handing
  the ship to `beginArrival`: the tug delivers you to the apron and the port
  draws you in, through the geometry that already knows about gates and
  berths. A tow that re-implemented docking would be a second copy of the
  hardest code in the project.

  Carried like an arrival but compressed like a long burn — its own branch
  in the main loop, because an arrival's legs are seconds and are forced to
  1×, whereas a tow is hours and would otherwise be a wait rather than a
  journey. You keep the seat throughout, which is what will make being
  interdicted mid-tow possible.

  **Two bugs worth recording.** A tow deliberately does not refuel you, so
  `stranded` stays true for the whole crossing — which had the rescue
  calling a fresh boat every frame, forever, for the same emergency. And
  `holdBase` reached for `global.Eco` when every other site in the file uses
  `global.Economy`, so the Syndicate silently valued every hold at zero and
  its whole menace evaporated; the test caught it on the first run.

- **Two rescue services, from two different homes.** A mayday for a tender
  used to be answered by one kind of ship that existed for no stated reason.
  There are now two, and where each one lives is the whole of the mechanic:

  A **port tug** never leaves home. It works a short hop between its own
  berth and the next port along, and it only exists at a **shipyard, a
  highport or a fleet carrier** — places where ships are actually worked on,
  not merely stopped at. Squat orange hull, harbour-tug names with no
  romance about the job: *Bollard*, *Capstan*, *Hawser*.

  A **rescue tender** is launched by a capital ship and rides its parent's
  own orbit, which is how two vessels keep company without an AI that flies
  formation. **The capital's size sets the tender's size** — a big warship
  launches a big tender — so a size letter is, for the first time in this
  game, a fact about a *particular ship* rather than about its class.
  The Syndicate flagship carries one too. That is not generosity: a salvage
  crew that reaches a stranded hull first is in a very strong negotiating
  position.

  The consequence is a map you can read. Help near a port is a question
  about **what kind** of port; help in the deep is a question about whether
  a capital flies there. And it makes a warship's presence cut both ways —
  the same hull that sees four times as far and cannot be bribed is also the
  reason anyone comes for you out there.

  **A measurement and a doctrine violation, both caught by the suite.**
  The first cut let tugs spawn at ordinary orbital ports — the commonest
  role in the game — which put 218 of them across forty systems, five and a
  half per system, every one a patrol to wake and steer. Restricting them to
  working ports gives 2.9 per system across 33 of 40.

  And the capital's size letter was first drawn with `rng.next()` **from the
  shared patrol stream**. `economy.test.js` failed inside a minute on an
  assertion about something else entirely — capitals had become *more*
  common than cutters — because one extra draw shifted every subsequent draw
  in `buildPatrols` and changed which systems got capitals at all. Every
  seed in the galaxy had quietly become a different place. The letter is
  hashed off the ship's own id now, and the tug and tender loops draw from
  their own forked substreams. Doctrine 2 exists for precisely this, and the
  test that caught it was not testing for it.

- **A GUNS page on the dashboard.** Which hardpoint answers which trigger
  used to be visible only on the F5 FIT page, and F5 is the wrong place to
  find it out, because you cannot open the yard while somebody is shooting
  at you. Click a cockpit panel round to GUNS and it shows both groups with
  a live count, every hardpoint the hull has — including the empty ones,
  because a hole in the rack is a fact about your ship — which way each one
  points, which trigger it is on, and how far through its cycle it is, over
  the hull-heat bar and the sink's state.

  It stores nothing of its own. Group membership is the same map the
  trigger reads, readiness is the same cooldown the trigger writes, and the
  side pointer comes from the muzzle the renderer draws the beam from, so
  the panel cannot drift out of agreement with the ship. Under time
  compression, where the triggers refuse, it says so rather than reciting
  keys that would do nothing.

- **A spent heat sink is now something in the world.** It used to be three
  numbers in a list nothing read. Ejecting one now throws a tumbling,
  white-hot block clear of the hull: it drifts on the same physics as
  wreckage, it is the loudest thing on your scope while it is hot, and it
  cools to a dull grey brick over about two and a half minutes — half its
  heat gone every thirty-four seconds. It outlives a piece of wreckage, and
  the debris of a ship you kill can never delete it.

  Nothing else reacts to it yet. It is a record of where you were and when,
  sitting in space where anyone could find it, and what a patrol or a
  seeker does about that is still an open question.

- **The landing gear works, and it always did.** Shift+G has been flipping
  the state correctly for as long as it has existed — the drag changed, pads
  caught you, the status line said GEAR DOWN — but nothing on the ship
  moved, so the only conclusion available to a player was that the key was
  broken. Now three legs swing out of their bays over a couple of seconds,
  doors first, and fold back in the same order reversed.

  The legs come out of the models rather than being drawn by hand: every
  hull was already rigged with hinges, doors, struts and feet as separate
  nodes, and the converter now keeps that rig instead of welding it flat.
  Thirty-six of the fifty-two hulls have gear. The ones that do not —
  capitals, liners, navy cutters, freighters, escape pods — are the ships
  that never touch a pad, which is the right answer rather than a gap.

### Changed

- **Contraband is graded now.** A flat 180 cr/t said every illegal cargo was
  the same crime. The ladder, worst last: **narcotics** (somebody's vice),
  **restricted arms** (somebody's war), **military drive fuel** (naval
  materiel in hands the navy did not licence). Ten tonnes costs 1,800,
  4,500, or 9,000 cr — the last of which sits just under the flat 10,000 for
  carrying radioactive waste into a Syndicate hold, which stays the worst
  thing on the board and stays off this ladder entirely, because that is a
  protection racket enforcing its own law rather than a state enforcing a
  graded one. The standing hit is graded the same way, by the **worst** item
  found rather than the average: a hold of narcotics with one tonne of naval
  fuel in it is a naval-fuel problem.

- **Military drive fuel is contraband depending on who is asking.** It is
  not flagged illegal in the catalogue and it must not be — it is bred at
  licensed plants and sold at a listed price, and flagging it would have
  made the whole legitimate trade a crime. It is an offence only in the hold
  of a pilot with no standing with the flag that stopped them, at the same
  threshold the Chernobyl drive itself is sold behind. One number, so a
  pilot cleared to own the drive is cleared to carry what it burns.

### Fixed

- **Lightning went back to a strobe (restored 2026-10-19).** The 10-17
  branch merge kept the other side's copy of the planet shader's flash
  block, and the old one-slot lightning came back with it: every stroke
  started on the same 0.9 s beat. Restored from the Driftwood commit:
  strokes slide off the beat by a hashed offset, a late stroke is
  allowed to finish in the next slot, and storms burst and go quiet on
  four slow rhythms instead of firing at a flat rate. The cut-band code
  the merge brought in is untouched. `test/weather.test.js` was the
  canary (it checks that every weather constant reaches the shader) and
  is back to 41/41; the shader compiles on the GPU and planets draw.

- **Buying off a passing ship emptied the whole line, for the session.**
  The purchase came off `route.out` — the template manifest every later
  sailing of that line reads — so six tonnes bought once meant every
  future voyage sailed six tonnes light, and a line bought dry ran empty
  until the next reload. What a voyage has lost is now a per-voyage ledger
  (`G.shipTrade`), forgotten when the voyage ends; the timetable stays a
  pure function of the seed.

- **Every ship in the game was flying with its landing gear down.** All
  fifty-two models were authored with the legs extended, and the converter
  baked every node transform into the vertices, so three legs were welded to
  the belly of every hull — in flight, in combat, in slipspace, on the F5
  hull viewer. Nobody had reported it as a bug, because with nothing able to
  retract them there was no "up" to compare against; it surfaced only when
  the gear was given real motion and the belly came out clean.

- **Piracy stopped working the moment you died.** A respawned ship came back
  without a cargo scoop, so a robbed freighter dumped its hold exactly as it
  always had and none of it could be picked up. The refusal speaks once every
  twelve seconds, which is easy to miss entirely — so the conclusion available
  to a player was that robbing ships was broken, not that they were missing a
  1,400 cr fitting nobody had told them they had lost.

  The cause was two pieces of code assembling the same ship with no reason to
  agree. `migrateFit` issues the starting kit, but only when the fit map is
  **empty**; `stripForRespawn` hand-wrote a map with the starter gun in it, so
  the early return fired and the kit was never issued again. When the scoop
  stopped being a property of having a hold and became a fitting, only one of
  those two learned about it.

  There is one starting-fit list now (`STARTING_FIT`) and both paths read it,
  so they cannot drift apart again — and `stripForRespawn` no longer sets the
  four legacy weapon fields by hand, which means it can no longer set them
  wrongly by hand either. Two checks that would have caught it: one asserting a
  new ship and a respawned one carry the same thing, and one in the render
  suite that robs a crate **after** a respawn and drives the real frame loop.
  Both were confirmed to fail with the fix removed — the two scoop checks
  already in the suite passed throughout, because both ran on a ship that had
  never died.

- **Contraband was being detected and then not punished.** A search would
  find a dirty hold and the cargo would stay aboard with no fine. The cause
  was in the suite rather than the game: the test pinned `Math.random` to a
  single low value to force the search, and once the bribe branch landed
  that same value also sailed under the bribe roll, so the inspector took a
  payoff every time. The test now feeds a *sequence* — low to search, high
  to refuse the bribe — which is what a test has to do once the code under
  it draws twice.

- **A witnessed crime is no longer expected to be reported instantly.**
  Same shape of problem: a third-party witness takes eight seconds to get on
  the radio, and those eight seconds are the window in which their silence
  can be bought. The old check asserted instant reporting, which amounted to
  asserting that the hush mechanic could not exist.

- **Jettisoning cargo actually gets rid of it.** It did not. A crate leaves
  the airlock 50 metres astern; the scoop reaches 80; so the ship swallowed
  it again on the very next frame and the hold came out unchanged. The only
  symptom was cargo that would not go away.

  Anything you push out yourself is now inert until it has genuinely got
  clear of you. That is a **distance** test rather than a timer, on purpose:
  a timer in sim seconds evaporates under time compression, and a timer in
  real seconds could be waited out sitting still. It resolves on its own in
  about seven seconds from the shove the airlock gives it, or instantly if
  you are moving. Cargo somebody *else* dumped is catchable at once, which
  is what makes robbing a freighter work at all.

  This had a `frames(60)` sitting right on top of it in the suite that only
  ever checked for exceptions. It checks the hold now.

### Added

- **The cargo scoop is a fitting.** Picking things up used to be a property
  of having a hold, which made throwing cargo overboard reversible and
  therefore meaningless. It is now a utility-slot item — 1,400 cr, stocked
  everywhere, **fitted on a new ship** so nobody learns the rule by watching
  their own cargo drift away.

  Three systems get a spine out of one change: dumping cargo to outrun
  somebody is a decision you cannot take back, a freighter dumping its hold
  in front of you is only worth robbing if you brought the equipment, and a
  debris field is something you prepared for rather than drove through. Sell
  it if you want the slot — on a Talon it is competing with the turret, the
  sink launcher and both scanners for one of two.

  It draws **no power**, which is a decision and not an oversight: a scanner
  runs continuously, a scoop is a hatch and a clamp that work for a few
  seconds a day. The first version charged it 0.4 MW and the suite
  immediately reported four separate measured budget facts moving, including
  the one where an oversized slipspace anchor stops fitting a Talon. Its
  price is a tonne and a slot — enough that a Class 3 beam, a Mk II reactor
  and a shield on a Kestrel, which come to *exactly* its 22 t budget, mean
  the glass cannon flies without one.

  Nothing to do with the fuel scoop, which is one of the heat shield's jobs.

- **A signed contract can finally explain itself.** The ACTIVE CONTRACTS
  column on F7 now spells out where each job is actually going — the berth,
  the body it sits on, and the system, or for a courier the star and the
  fact that any port there will do — and every contract carries its own
  **DETAILS** button, which opens the long form you signed it with.

  Both of those had been on the contract the whole time. `accept()` copies
  the destination across and deliberately *carries* the long form rather
  than regenerating it, so that a job signed a week ago still says what it
  said when you signed it. The board had the button; the one place the text
  was designed to be read did not. Now it does, and the F7 screen has tests
  covering it — signing a contract and then drawing the screen was a path
  the suite had never once exercised.

- **Mission headlines are generated rather than concatenated.** A board used
  to read as one fixed sentence shape per job type. It now assembles
  `[URGENCY] [VERB] <core> [— TAIL]`, where the core — tonnage, commodity,
  destination — is never touched and everything else has to fit a 64-column
  budget to appear at all. "Priority: Run 6t Metal ores to Coldwater Post —
  they are short" instead of "6t Metal ores to Coldwater Post".

  The urgency prefix is a **true tell**: it appears when the fee sits in the
  top quarter of that job type's own pay band. A board that shouts is a
  board worth reading twice.

- **Mission prose reads the world instead of a bigger adjective list.** The
  long form now names the destination's actual role ("the reprocessing plant
  at Halden Dock"), says when a run goes down a shaft into an underground
  bay, quotes the real distance in light years for a courier, notices when
  the far end is genuinely short of what you are carrying, and warns you
  when the route crosses permissive space. All of it is read off state the
  mission and the economy already had.

  The rule that makes this safe is unchanged and is the whole reason the
  generator is allowed to exist: **the grammar may only combine fragments
  that describe state the mission actually has.** A clumsy join is the worst
  failure available; a sentence describing a job you cannot do remains
  structurally impossible.

  Two fragments were written and then deleted for being *true but useless* —
  "there is more of it on this dock than anyone can use" and a matching
  "— surplus here" tail. A haul is only ever offered in a good the origin
  exports, so both were true of every haul ever generated, which is a
  tautology dressed as insight printed on two thirds of the board.

- **Faction campaign chapters have a long form at all.** `arcs.js` built its
  own contract objects and never called the finisher, so every campaign
  chapter shipped with a headline and no description — the one kind of work
  that most deserves an explanation was the only kind that had none.

- **Your bridge belongs to your ship.** Every hull in the game sat in the same
  room behind the same glass — a Dart interceptor and a Mule freighter had
  identical cockpits, which is a poor joke when the cockpit is the only part
  of your own ship you ever actually look at.

  It is a kit now. **Type** decides the character: an interceptor wraps more
  glass around a tighter seat, a freighter sits you back behind a heavy brow.
  **Size** scales it, read off the hull's own mass — so a hull nobody has
  designed yet still gets a sensible bridge without anyone adding a row to a
  table. And a little **flair** on top, seeded so it is yours.

  The seed is the hull's birth mark, stamped when you buy it — deliberately
  *not* the registration, which you can retype on the yard page. Renaming your
  ship does not rebuild the cockpit around you.

  The Talon's bridge is unchanged, and that is on purpose: every multiplier is
  1.0 for it, so the room that was tuned by hand is still exactly that room and
  everything else deviates from a known-good one.

- **The canopy wraps, and it is raked to the hull you are flying.** The old
  glass was one flat pane at a fixed 1.20 m for every ship. There are
  quarter-lights outboard of the windscreen now, so turning your head finds
  more sky and less wall — an interceptor sees noticeably further round than a
  freighter. The lean of the glass is measured off the hull's own model rather
  than chosen: a long fine nose gets steeply raked glass, a blunt one sits
  more upright.

  The windscreen itself stays flat, which is not a shortcut. A curved pane
  projects as tan(elevation)/cos(bearing) through a flat camera, so it bows
  off the top and bottom of the view at the corners — which is exactly why
  real windscreens are flat glass and the wrap comes from separate panes.

- **The cockpit screens stop skewing when you turn your head.** The readouts
  were drawn by mapping a flat page onto the panel with a 2D transform. That
  transform is built from three of the screen's four corners and *cannot* use
  the fourth — an affine maps a rectangle to a parallelogram and nothing else.
  The housing was drawn with all four, so the frame was a true perspective
  quad with a parallelogram of content sliding around inside it. The more you
  turned, the further apart they got.

  Each screen is now a real lit rectangle bolted to the console, drawn by the
  same projection as the rest of the world, so the perspective is exact rather
  than approximated — no subdivision, no seams, nothing left over at the
  corners. The housing, bezel and stalk are still 2D; they are opaque
  furniture and were never the part that skewed.

  Without WebGL2 the old path still runs, skew and all. A wrong-looking
  readout beats a blank one.

- **You can break into a starport.** A surface port's doors are not commanded
  on the port — they answer to a control cabinet standing out on the rock
  beside the works. It has to be outside, because a computer that lets you in
  cannot be inside the thing it lets you into. And because it is outside, it
  is exposed: you can set down beside it, and so can somebody who was never
  granted anything.

  That is the mechanic. Faction standing decides whether you are **granted**
  clearance and has no bearing whatever on whether the cabinet can be
  **taken** — so the port that will never clear you is exactly the one you can
  still get into. `F4`, pick the port, `H`.

  It is loud. A failed attempt trips the alarm, books a bounty with the
  cabinet's owner, and locks the panel for 45 seconds — turning a closed door
  into a warrant, after which the same doors are shut to you for a reason you
  brought on yourself. A developed world has better locks than a backwater,
  and it is the **same** lock every time you come back to it: the difficulty
  is derived from the world, only the roll is a roll.

  Two things it deliberately is not. It is not a launch clearance — getting in
  is not the same as getting out, and asking for the way out is still a
  conversation you have to have. And it does not defeat the interlocks, which
  are mechanical: the lift still cannot come flush while the doors are shut,
  whoever is giving the orders. A breach also does not follow you to the next
  system; a port whose lock you broke once is not a port you own.

  You will find out about it the way you should: ask a port that hates you for
  clearance while parked next to its cabinet, and the refusal mentions it.

- **You can watch yourself being docked.** Landing on a pad with a hangar
  under it used to park the ship in a single frame. Now the apron doors open
  under the hull, a level car carries it down the 45° shaft, the inboard gate
  opens, and a traverser runs it across the floor to its assigned bay — about
  eighteen seconds, and **the camera is yours the whole time**, so you can
  orbit the hull while it is being carried. Time compression is held at 1×
  while it runs, because a sequence measured in seconds resolves into nothing
  at 500×.

  The best moment is not the machinery, it is the sky: on the apron you are
  still outside, with the planet and the stars where they should be. When the
  car starts down and the leaves seal above you, the world goes away — because
  something closed over your head, not because a flag flipped.

  A bare pad with nothing under it still docks instantly, as do orbital
  clamps: there is no shaft to be carried down.

- **A berthed ship is inside a building.** Park in a surface port and the
  hangar is now the whole world: no stars, no ecliptic grid, no orbit lines,
  no other planets, no traffic, and no sun-glare across the canopy. Before
  this the walls were there but you could see the solar system past the end
  of them, which read worse than no walls at all — it made the room look
  like a texture. Pressing **F2** for the orbit chart still shows you the
  system, because answering "show me the system" with the inside of a shed
  would just be a blank map.

- **Glass is translucent.** Every port town grows greenhouses — a colony on
  a world nobody can breathe on has to make its own air — and the crop
  inside them is lit precisely so that you can tell there is something alive
  in there from a long way off. The panes over it were solid, so you never
  saw it. Now you do.

- **Everyone has shields now, and you can see them work.** Warships and money carry a
  field; freighters, shuttles and escape pods do not. When something hits one
  it **flares where it was struck and the energy spreads out across the rest
  of the bubble and dissipates**, and the field is not a sphere — it is the
  ship's own shape, held about a metre off the plating. A shot that gets
  through makes a hot bloom on the hull instead, so which effect you see tells
  you whether the shield is still holding without reading a number.

  The field also **changes colour as it wears down** — cold blue-white while
  it holds, amber as it goes, hot red when it is nearly gone. And because you
  cannot see your own hull from the cockpit, a hit you soak now blooms on the
  inside of the canopy in the direction it came from, which doubles as a
  warning about where the shooter is.

- **And carrying two kinds of gun finally pays.** The pulse-soaks /
  beam-drains numbers have been printed on every laser in the shop since the
  weapons were retiered, and nothing in the game ever read them — there was
  only one shield, it was yours, and your own guns never hit it. Now that
  other ships have fields, the whole thing switches on: against a naval
  cutter, stripping with a beam and then opening the hull with a pulse takes
  **14 shots against 18 for the best single weapon**. That is what fire groups
  were for.

- **Ships come apart when you kill them.** The explosion has been standing in
  for this since combat existed — two expanding rings and then nothing, as
  though the hull had been deleted rather than destroyed. A wreck now throws
  six to sixteen tumbling shards, more from a bigger hull, and **some of them
  are worth taking**: what did not spill as intact crates was aboard when the
  ship broke up, so it comes off as salvage you scoop the same way you scoop
  anything else. The radar tells you which is which — scrap is a dim grey
  dot, salvage is the amber cross a crate gets — because picking through a
  debris field is the game, and hoovering one is not.

  Same seed, same wreck: the pieces are hashed off the ship's own id, so a
  replayed kill throws the same shards the same way. They live ninety seconds
  and vanish when you leave, which is what stops a system that has seen a
  hundred fights from being a hundred fights' worth of litter.

- **The two slipspace modules are things you can buy.** The Wake Baffle and
  the Harmonic Transit Anchor have been priced and read by the corridor since
  it was built, and there was no way to purchase either one. They are now
  ordinary fittings in the internal slot — **four classes each**, because the
  class is what the field covers — so they cost power, cost tonnage, save
  with the ship, and refuse in words when they will not go.

  | | Mass | Draw | Price |
  |---|---|---|---|
  | Wake Baffle I–IV | 2–6 t | 0.8–2.0 MW | 6,000–28,000 cr |
  | Transit Anchor I–IV | 4–11 t | 3.2–7.0 MW | 28,000–140,000 cr |

  A baffle needs a moderately developed port; an anchor needs a developed one
  that likes you, the same counter that sells the muon lasers. And the budget
  now says what a bespoke field could not: a Class IV anchor on a Talon is
  seven of its nine megawatts and eleven of its fourteen tonnes, which is
  legal, ruinous, and visible before you spend rather than after.

- **Fire groups, and a second trigger.** A hull with more than one hardpoint
  now has two of them. Every gun starts on group A; move one to B on the F5
  FIT page and it answers a different trigger:

  | | Group A | Group B | Missile |
  |---|---|---|---|
  | Keyboard | `Space` | `Shift`+`Space` | `B` |
  | Mouse aim (`F9`) | mouse 1 | mouse 2 | middle button |

  Hold either, or both at once — a beam group stripping the shield while a
  pulse group works the hull is the loadout the shield model was built to
  reward, so forbidding it would have quietly deleted that build. Cooldowns
  are per *slot*: two guns in one group are two triggers pulled together, not
  one gun firing twice as fast.

- **The mouse is a weapon, in mouse-aim mode.** With `F9` aim on, the nose
  now follows the mouse with **no button held** — which is what frees the
  buttons to be triggers, and what fixes the previous arrangement where you
  could only turn the ship while dragging. Mouse-aim off is unchanged:
  left-drag turns your head, `Space` and `B` still shoot. Right-click over
  the canvas no longer opens the browser menu mid-fight.

- **Beams heat your own hull — for real this time.** The heat sink shipped
  built, tested and completely inert because nothing in the game generated
  weapon heat. Now every shot puts its rated waste heat in, through the same
  `addHeat` a live sink intercepts. One shot costs `heat × cooldown`, so a
  weapon held down costs exactly the figure the catalogue prints and one
  fired in taps costs proportionally less, with no second number to keep in
  step. Against a bare hull's 18/s shed: a photon beam (12/s) can be held
  down forever, a kaon beam (26/s) gives about twelve seconds, a muon beam
  (46/s) under four. The turret's own heat rating is now spent too.

- **A pirate's hold is a pure function of its registration.** It used to be
  invented with `Math.random()` at the moment of death, which broke the
  project's first doctrine two ways: the same wreck on the same seed threw
  different goods every time, and robbing a pirate *alive* could disagree
  with killing it about what it had been carrying, because only the death
  path ever invented a manifest. Both now read one hashed hold — salted with
  the system seed, since patrol ids are numbered per system — and the loot is
  drawn from **what actually flies in that system**, so a run on medicine
  means pirates full of medicine. The scatter of the canisters and the cash a
  robbed ship hands over are derived the same way, so neither can be rerolled
  by reloading.

- **Equipment slots.** Every hull now has typed slots — hardpoint, utility,
  internal — plus a **reactor output budget in megawatts** and a **fit
  tonnage budget**. What you can carry is now a decision instead of a
  shopping list.

  | Hull | Power | Hardpoint | Utility | Internal | Fit mass |
  |---|---|---|---|---|---|
  | Dart Interceptor | 7.0 MW | 2 | 1 | 2 | 9 t |
  | Talon Courier | 9.0 MW | 2 | 2 | 3 | 14 t |
  | Kestrel Multirole | 14.0 MW | 3 | 2 | 4 | 22 t |
  | Mule Freighter | 18.0 MW | 2 | 3 | 5 | 30 t |

- **Nine lasers**, three classes by emitter size and three varieties by how
  the energy is delivered. The varieties are not a ladder — they trade
  against the shield model that already existed:

  | Variety | vs shield | vs hull |
  |---|---|---|
  | Pulse | ×0.6 | ×1.2 |
  | Intermittent | ×1.0 | ×1.0 |
  | Beam | ×1.5 | ×0.7 |

  A beam strips a shield and struggles with armour; a pulse is the reverse.
  Carrying both is the intended answer, which is what fire groups will be
  for.

- **Beams heat your own hull.** Rated in heat units/second against the
  existing re-entry model: a Class 1 beam (12/s) sits under what a bare
  hull radiates and can be held down forever; a Class 2 (26/s) gives about
  twelve seconds; a Class 3 (45/s) gives under four. The ablative heat
  shield covers all of them — so a re-entry module is now combat gear too.

- **Auxiliary reactors, Mk I–III.** +2.5, +5.0 and +9.0 MW for 5, 9 and 14
  tonnes and an internal slot. One reactor of any tier. These are what make
  the mass budget bite: before them, power was the binding constraint in
  every build and fit tonnage was close to decorative.

- **Selling fittings back**, at 45% of list. A refit is a haircut, not an
  investment.

- **`canFit` explains itself.** Every refusal carries a reason in words —
  "needs 13.0 MW, only 7.2 free" — because a greyed-out button that will
  not say what is wrong is indistinguishable from a bug.

- **Availability data** on every item (`minDev`, `minStanding`, `minCrime`,
  `grey`), ready for the port-stock work: developed ports will carry the
  heavy classes but only sell them to factions that like you, while
  high-crime ports will sell cheap gear to anyone including a fugitive.
  The data is in; the yard does not read it yet.

- **Pilot name, ship name and registration**, on the F5 page. Pilot and
  ship names are yours and cost nothing. Registration is a legal record: a
  dockside job at 250 cr, either typed in `LL-NNNN` form or rerolled from
  the seed. All three persist in the save.

- **Text entry**, which this game has never had. It is a small widget and
  one rule: **while a field has focus it eats the entire keyboard.** Naming
  your ship must not jettison waste on the W or flip to MFD page 5 on a
  digit, so `main.js` consults it before the function-key and number-row
  handlers, which run early and would otherwise steal half the alphabet.
  Enter commits, Escape abandons, leaving the page abandons.

- **The yard rebuilt** around slots, in three tabs — FITTING, BUY, HULLS —
  with a permanent power/mass/slots bar above them. Fittings can be sold
  from the FITTING tab.

- **The yard scrolls.** Rows are built as a list and then drawn through a
  window, rather than painted straight into a cursor that ran off the
  bottom of the panel — which is why a Mule's ten slots used to simply
  vanish. Mouse wheel over the list, or click above/below the scrollbar
  thumb to page. The wheel is claimed before the camera zoom, so rolling it
  over a shop no longer flies the camera backwards out of the cockpit.

- **The yard is named for the port it is in** — `MINING HEAD · OUTFITTING`,
  `AGRICULTURAL CO-OP · OUTFITTING`. It used to say "SHIPYARD &
  OUTFITTING" everywhere, including at a farming co-op with three items on
  the shelf. Now that stock genuinely varies, the sign tells the truth
  about the place, the way the trade console always has.

- **Heat sinks.** A launcher (utility slot, 4,800 cr) holding three
  charges at 320 each. A live sink banks 60 units of stored heat on the
  spot, then takes 65% of everything generated for six seconds or 220
  units. The fraction is the design: at 100% the heat clock stops and it
  is a panic button, at 65% it merely slows, so a sink extends a window
  rather than suspending one and cannot rescue you once you are cooking.
  Ejects itself when full or expired.

  The plumbing (`Combat.addHeat`) is in and tested, and weapon heat now
  actually arrives — see fire groups above, which is what switched this on.
  The ejected sink becomes a real tumbling object with the debris system.

- **Every item has a sales pitch** — the yard's own copy, shown after the
  numbers on any line you can actually afford and fit. Where a pitch is
  unflattering that is deliberate.

- **Ports stock different things.** Development gates what is on the shelf,
  standing gates whether they will sell it to you, and a lawful port will
  not arm someone it wants. Locked lines are *drawn, with the reason*, not
  hidden: "needs WARM standing with the Halden Combine" reads as a goal
  where a missing row reads as a bug.

### Changed

- **A new career starts on a spaceport, not in orbit.** ⚠️ *Written but not
  yet run.* You begin docked at a port on the home world — stationary, with
  the trade console and the yard available before you have risked anything —
  and getting off the pad is the first thing you choose to do rather than the
  thing that has already happened to you. Launch clearance is not handed to
  you: hail port control on `F4`, then `U`. The first orbit you fly is one you
  put yourself into, which is the thing this game is actually about.

  A respawn after a crash still puts you back in orbit. Being handed your ship
  back on a pad would quietly undo the cost of having crashed.

- **The auto-turret moved to a utility slot.** Hardpoints are for guns you
  aim with the nose, which is what this game's guns have always been.
- **Duplicate uniques are refused rather than sold.** A second shield
  generator, heat shield or turret did nothing but burn power and tonnage.
  The shop now says so instead of taking the money.
- **Buying a hull revalidates your fit** and refuses the sale if the gear
  will not go, exactly like the existing refusal when your cargo will not
  fit the new hold. Silently dropping a Class 3 laser on a downsize is
  worse than the sale simply not happening — you would not find out until
  the next fight.
- **`ship.gun` now reads `c1pulse` rather than `pulse`.** The old ids
  survive as aliases pointing at the same objects, so nothing that reads
  `Combat.GUNS.beam` broke.
- The old `pulse` maps to **Class 1 pulse**; the old `beam`, at 15 damage a
  shot, maps to **Class 2 intermittent**, which is where that behaviour
  actually belongs on the new ladder.
- **Bolts are streaks now, not slugs.** They were reported as too chunky and
  too slow, and the slug was the mistake: a pulse emitter fires a bunch of
  charged particles, a bunch debunches as it travels, so the bolt **gets
  longer on the way out** and then collapses into the point of impact rather
  than blinking away. The core is a third of its old width with a soft halo
  behind it — a bright bar has no centre for the eye to find — and the whole
  thing crosses in 0.20 s instead of 0.30, because a streak says a shot
  happened along its entire length and no longer has to dawdle to be seen.

- **And bolts are in the world now, not on the glass.** A tracer used to be
  drawn between two projected points with its width on a fixed pixel ramp, so
  every shot tapered by the same amount whichever way it was pointed, and the
  bolt slid across the screen at a constant rate however far it was going
  away from you. Both are fixed at once by walking the **world** ray and
  taking each point's width from its own distance: a shot crossing your view
  broadside is now an even ribbon, one fired away down the boresight narrows
  and its travel visibly slows as it recedes.

- **A Quit button on the main menu.** The title screen could start a career,
  load one and resume one, and had no way to leave the game — you closed the
  window. It now closes it for you, committing the autosave first. In a
  browser tab it says why it cannot instead of quietly doing nothing.
- **A robbed freighter now stays robbed.** Demanding cargo or credits used to
  pay out in full every time you asked, which one interdiction in deep space
  turned into an unlimited supply of money. A ship hands over its purse once
  and its hold a third at a time until there is none, and says so.
- **Interdicting a hauler is worth doing.** The ship you tear out of
  slipspace carries a hold scaled to its tonnage — roughly 4% of all-up mass,
  so a packet is about twelve tonnes and a bulk hauler about a hundred and
  ten, more than a Talon can lift. Which contact you chase down the corridor
  is now a decision rather than a formality.

### Fixed

- **A new career started at a spaceport, banked ninety degrees.** Docking
  chose the roll arbitrarily off whatever axis happened to be perpendicular
  to the ship, so a berthed hull sat on its side with its landing gear
  pointing at a wall. It is now levelled against the local horizon, and the
  attitude measures exactly level across every seed tried. A career that
  starts on the pad also **arrives with its docking clearance already
  spent** rather than being fined 500 credits and logged as a fugitive at
  its own home port on the first frame of the game.

- **Greenhouses were sealed drums.** The lit crop inside every one of them
  was drawn, and then hidden behind its own opaque glass — so the one
  feature meant to make a port town legible at night was never once
  visible.

- **Beams left the ship sideways.** They were drawn from `ship.pos`, which
  in the cockpit is eight centimetres *behind* the pilot's eye — projecting
  a point at a depth of roughly zero threw the origin toward infinity, so
  the shot swept in across the canopy instead of running down the nose.
  They now leave the **guns the model actually has**: `glb2hulls` records
  every `laserEmitter` node, so the courier's beams come off its chin guns,
  81 cm under the axis and at the nose — beneath the console, where you can
  see them from the seat. 33 of the 39 models carry real muzzles; the six
  that do not (capitals and escape pods) fall back to an offset derived
  from the hull.

- **And they stayed where they were fired.** A beam is now resolved live at
  both ends — muzzle from the ship's current attitude, far end from the
  target or from the current nose — so it no longer detaches at 5.5 km/s,
  nor pivots about its muzzle into the fan of stale rays that time
  compression turned it into.

- **The guns do not fire under time compression.** Cooldowns run on sim
  time, so at 500x every weapon cycled every frame: sixty shots a second,
  a hull cooked instantly, and nothing aimable, since the cone test was
  running against targets that jump hundreds of kilometres between frames.
  The refusal says so rather than quietly doing something absurd.

- **Beams are visible again from outside.** A 22 km beam with the camera
  120,000 km out was a third of a pixel, which is why the guns appeared not
  to work in the exterior view at all. The drawn length is floored, and the
  tracer is now a bright core inside a wider bloom instead of a hairline.

- **The mouse works outside the cockpit.** Mouse 2 fires group B and the
  side button launches in any view; mouse 1 stays the camera out there,
  because swinging the view around the ship is what the exterior view is
  for. Releasing the side button no longer cut the primary trigger.

- **Your ship came back from a save lying on its side.** ⚠️ *Fix written but
  not yet run.* Docking at an orbital station built the ship's attitude from
  an arbitrary perpendicular to its nose, so the bank angle it ended up at was
  whatever the arithmetic happened to produce. On its own nobody would notice
  — but loading a career re-docks the ship, and the game restores the autosave
  when it starts, and saves are almost always made on the clamps. So the
  ordinary path was: quit docked, come back, and find yourself banked ninety
  degrees with the attitude ladder reading it, before touching anything. A
  berthed ship is now level, with its gear toward whatever it is orbiting.

  The spawn attitude itself was never wrong — measured across five seeds it is
  exactly level, and the slow pitch drift afterwards is the orbital rate,
  which is correct for a hull with nothing holding its attitude.

- **A ship torn out of slipspace was always empty.** It flies an interstellar
  lane that no system's traffic list has ever heard of, so it inherited no
  manifest and reported itself running empty however many times you asked.
  The chase, the lock and the drop-out all worked and paid off in an empty
  room; they now pay off in a freighter's hold.

### Saves

**Cruise drives (2026-10-19) need no version bump.** The drive bay is a
new slot type keyed after every existing one (`drive0`, `drive1`), so no
saved fit key moves. A save without a drive is given a Class 1 on load
(`migrateFit`).

**Twilight worlds (2026-10-19) need no version bump.** Systems are
regenerated from the seed and every existing body keeps its id, so a
docked or targeted id still resolves. What does move:
- Every tidally locked world's day and pole changed, so pads on those
  worlds now stand somewhere else at a given moment.
- Pads on ring and band worlds were folded into their strip.

A ship saved docked or landed at one of those pads is put back on the pad
wherever it now is. A ship saved in free flight low over one could find
the ground in a different place.

**Nothing from 2026-10-17 touches a save.** The cruise sky and its trails
are pure functions of speed, heading and the seeded sky; the trail history
is never stored. The lift car and hatch data were added to the port index
as two new fields (`cars`, `parts`) and nothing else in it changed — proved
by diffing a fresh conversion against the shipped index, since the
converter on disk has drifted from the shipped data (a full re-run would
also rewrite 69 models' interior routes; that is a separate decision).
A ship already parked in a ring's small bay leaves by the new route.

**Runners change only a flag.** An existing career's systems keep every
port, route, manifest and price; some routes in lawful space now report the
Syndicate as their flag. Nothing to migrate.

**Ship-to-ship trade adds one field, `shipTrade`** — the per-voyage ledger
and the day's standing tally. An older save has none and starts with an
empty one. Rivalries are not saved at all: they are a pure function of the
galaxy seed, so an existing career gets its galaxy's quarrels on load.

**Existing careers load, with their gear.** The save version is
deliberately *not* bumped: `readSlot` and `load` discard any payload whose
version does not match exactly, so a bump would not migrate old saves, it
would delete them. The change is additive — a `fit` map and a `groups` map
are written alongside the four legacy weapon fields, and
`Combat.migrateFit` rebuilds a fit from those fields when `fit` is absent.

A save written before fire groups existed has no `groups`, and a missing
entry reads as group A — so an old career comes back firing everything on
the primary trigger, which is exactly what it was doing before the update.

A migrated ship keeps everything it owned even if the new budgets would not
strictly allow it. Confiscating something a player already paid for because
the rules changed underneath them is the worst possible introduction to a
new system.

**A slipspace module bought before this update still works.** They used to
live on a bespoke `ship.modules` field rather than in the fit map; that field
is still read as a fallback, so an anchor already aboard keeps holding your
corridor. New ones are bought and stored as ordinary equipment.

**A career that predates the cargo scoop keeps one.** `migrateFit` issues
it to any ship that has never had a fit map, which is every save old enough
to predate slots and every new ship. A save that already carries a fit map
is left alone and buys one at the yard — and that asymmetry is deliberate,
because it is also what makes SELLING the scoop stick: it lives in the fit
map like every other fitting, and the fit map is what is saved.

**The GUNS page and the spent heat sink cost a save nothing.** Neither the
canister list nor which page a cockpit panel is showing has ever been
written to a save, so there is nothing new in the file and nothing to
migrate. An old career simply gains a page it can click a panel round to,
and starts leaving blocks behind it the next time a sink ejects.

**Nor does the landing gear.** `ship.gear` — the switch, which is what
every rule reads and what is saved — has not changed meaning. The new
`gearTravel` is where the legs have physically got to, it is not written to
the file, and on load it initialises to wherever the switch already is: a
career saved on a pad comes back standing on its gear, one saved in flight
comes back clean, and neither sees the mechanism move.

**Contracts already in flight are untouched.** A signed mission keeps the
headline and the destination it was signed with — the new generator runs
when a board is built, not when a contract is read, so nothing you already
agreed to changes wording underneath you. The only visible difference is
that a contract signed before the long form existed has no `desc` and
therefore shows no DETAILS button; the next one you take will have both.

**The docked start only applies to new careers.** It runs on the fresh-game
path, so loading an existing save puts you back exactly where you left off,
in flight or on a pad as you were. The levelled berthing attitude is
computed at docking rather than stored, so an old save that was written
while parked crooked comes back level.

**Wreckage is not saved, on purpose.** A debris field lives ninety seconds
and vanishes when you leave the area. Serialising one would mean loading into
somebody else's explosion.

**Shields need no migration.** An NPC's is assigned the first time something
shoots at it, exactly as its hull points already were, so nothing about a
saved career has to know they exist. Your own shield is the module you already
bought; what is new is only what it looks like when it works.

- **`glb2hulls.js` now splits cockpit interiors out of the hull.** The
  redesigned ship models carry `cockpitInterior` / `pilotSeat` /
  `pilotSeatBack` inside the same `.glb` as the exterior, and the old tool
  merged every node into one mesh — welding a chair inside the fuselage,
  invisible from outside and unusable as a cockpit. Geometry is now sorted
  into `v/f` (exterior) and `interior` by node name, with the canopy's
  bounding box emitted as `glass` so a seat view can mount against it.

  Both parts are normalised by **one transform measured on the exterior**.
  Normalising each independently would scale a two-metre chair to the
  length of the ship; this way the hull's unit length is also unchanged
  from before the split, so nothing tuned against the old scale moves.

  The tool now reports interior triangle counts per model and names any
  model that arrives without one.

- **All ship models replaced with the redesigned set.** 33 models, 11 types
  × 3 sizes: capital, courier, **escape_pod** (new), fighter, freighter,
  h2_freighter, liner, police, shuttle, trader, tug. Every one carries a
  cockpit interior (60–96 triangles) and a canopy box. `hulls.js` grew from
  4.5 MB to 5.7 MB.

  The previous 30 models are preserved in `ref/glb-superseded/pre-redesign/`,
  and the six older revisions that shipped alongside the new set (capital
  `(2)`, courier `(1)` — the two without interiors) in
  `ref/glb-superseded/`. The old `hulls.js` is kept as `src/hulls.js.prev`.
  `readdirSync` is not recursive, so the superseded folders are excluded
  from conversion automatically.

- **Two new ship classes: naval interceptor and rescue tender.** 39 models
  now, all six new ones carrying cockpit interiors and canopy boxes.

  **Navy flies `navy-m` instead of `capital-m`.** That was a real
  mismatch, not a cosmetic one: a navy that only fields capital hulls
  cannot be *dispatched*, and dispatched hunters are what the notoriety
  work needs. The capital hull is now free for what it is for.

  **Rescue tenders** run a short local loop in any system developed enough
  to keep a crew standing by — 23 of 25 sampled systems have one. Unarmed
  by design, like the shuttle, but for the opposite reason: what protects
  a tender is that shooting one costs **14,000 cr**, more than killing a
  patrol cutter. A cutter came looking for you; the tender was on its way
  to help somebody.

  The rescue *mechanic* is not built. The ship is in the sky first on
  purpose — being able to see the service is half of knowing you can call
  it.

- **Merchantmen shoot back. Only shuttles fly unarmed.** `updateNpcFire`
  used to skip every trader outright — *"freighters carry no guns"* — so
  robbing one was a chore rather than a decision. Now everything is armed
  except shuttles.

  Deliberately feeble: a trader's gun does 2 damage at 8 km against a
  warship's 5 at 12 km. It is not meant to win, only to make a robbery
  cost hull and time so the mercenary escort is still worth hiring and a
  pirate still prefers the soft target. **The real defence is the clock**
  — a merchantman calls for help in 5 seconds where an armed ship takes
  10, which leans on the witness system rather than on damage.

  A hit freighter now sets `defending` rather than `hostileToPlayer`: it
  fires while it runs, and it still runs.

  The shuttle staying unarmed is a role, not a weakness — it is the hull
  nobody scans twice, which is what you want when the cargo is a sabotage
  device.

- **A hull-budget rule, now enforced by test:** a reactor must run every
  core system the hull has room for and still light the cheapest gun.
  **The audit found the rule already held**, and was a useful surprise —
  the Dart looked like the failing case (shield + heat shield + turret is
  5.4 MW of its 7.0, and a gun needs 1.8) but it cannot carry all three
  anyway: those three weigh 10 t against its 9 t budget, so **mass binds
  before power** and the lockout is unreachable. No numbers changed. The
  test is the deliverable — the rule is enforced now rather than believed.

- **Weapons retiered by particle, with range falloff.** Following
  `PLAN.md`, a laser's tier is now what it
  fires rather than how big its emitter is, and the particle decides how
  damage behaves with distance:

  | Tier | Falloff | Character |
  |---|---|---|
  | **Photon** | none | massless, does not decay — longest reach, least damage, universal |
  | **Pion / kaon** | 0.85 | ~26 ns lifetime, loses coherence fast — brutal close, near-useless far |
  | **Muon** | 0.25 | ~2.2 µs, time dilation carries it — holds damage at range |

  Measured at the extremes: a photon pulse delivers 5.0 at 2 km and 5.0 at
  22 km; a pion pulse 19.5 at 1 km and **3.0** at its own maximum; a muon
  pulse 23.8 close and 18.0 at 34 km. Range stops being a cutoff and
  becomes a curve.

  The 3 × 3 shape, the shield interaction (pulse ×0.6, beam ×1.5) and the
  power budget all survive — only what a tier *means* changed.

  **Every old id still resolves.** `c1pulse` … `c3beam`, plus the original
  `pulse` and `beam`, are aliases. This mattered more than it looked: they
  had to be added to `EQUIPMENT`, not just `GUNS`, because a save stores
  ids *in slots* and a lookup that missed one would have silently dropped
  the player's gun on load. Fits now normalise to the canonical id the
  first time they are touched.

- **A port sells only what it makes. It buys anything.** The market is
  asymmetric now, which is what turns a trade route into a route rather
  than a price lookup — you cannot buy computers at a farming co-op just
  because there are some in the warehouse, since that stock is what the
  colony eats, not merchandise. Supply is a fact about a place; demand is
  a fact about a need.

  Measured before committing to it: 53% of rows are exporters, an average
  port sells 6.8 of the 12.8 goods it lists, and **no port in any sampled
  system is left with nothing to sell**. A refusal names the reason —
  *"Waypoint Dock consumes grain, it does not export it — they will buy
  yours"* — rather than greying a row out.

  **Fuel is the deliberate exception.** Only 20% of ports produce
  hydrogen while every port stocks and burns it, so a strict rule would
  leave four ports in five unable to sell fuel and strand anyone who did
  not plan two jumps ahead. A port that imports fuel and resells it is
  what a fuel depot *is*.

- **Hydrogen is priced by the haul.** Its structural price now scales with
  the port's distance from the nearest gas or ice giant — 5.5% per AU,
  capped at +85%, with a flat +95% in a system that has no giant to skim
  at all. Distance is orbital radius about the star, not a distance at an
  instant, because a structural factor must not depend on `t`.

  | Port role | avg fuel price |
  |---|---|
  | Refinery (at a giant) | **42** |
  | Mining head | 91 |
  | Orbital port | 101 |
  | Highport | 137 |

  6.5× between the cheapest and dearest port across 25 seeds. The good
  part fell out rather than being designed: a rich mining world far from
  any giant charges more for its ores *and* pays more for its fuel, so its
  real margin can be worse than a poorer world sitting beside a refinery.
  "Expensive wares" and "profitable to work" stop being the same
  statement.

- **Mission board: a headline and a long form.** `text` is what the job is
  — terse, factual, hard-capped at 240 characters so a board stays
  scannable however baroque later mission types get. `desc` is who is
  asking and why, behind a DETAILS button on the F7 board, word-wrapped in
  place. Both are carried onto the accepted contract, so a job signed a
  week ago still explains itself.

  The long form is assembled from a pool of fragments joined by rules, and
  there is one rule that keeps it honest: **the grammar may only combine
  fragments that describe state the mission actually has.** Every slot is
  either a real value off the offer or connective tissue true of every
  mission of that type, so the worst case is a sentence that reads oddly —
  a sentence describing a job the player cannot do is structurally
  impossible. There is a test that every long form names the real
  destination and the real fee.

  Fragments are drawn from the offer's **own** seeded stream, never the
  board's, so a board reads the same when you come back to it and offer
  generation loses not a single draw to prose.

  Applied in one place at the end of `boardAt`, so a mission type added
  later cannot ship without both fields.

- **The settlement chain — one knob for how rural or developed the galaxy
  feels.** Drake's equation with the biology thrown away: Drake's terms are
  about life arising and becoming intelligent, and this galaxy has no
  aliens in it, so the filter is economic rather than biological. What is
  worth stealing is the *shape* — a named chain of factors, each arguable
  separately, multiplying out to a headline number.

  ```
  worlds settled = systems × nHab × fSettled × fGrown × fHub
  ```

  Every term was already being computed somewhere in `economy.js` or
  `generate.js`; naming them means you can see why a galaxy came out as it
  did, and there is one place to turn when it should feel different.
  `Eco.setPressure(p)`, 0.25 to 3.0, and `Eco.galaxyProfile(Gen, seeds)`
  reads the chain back off real systems.

  | pressure | ports/system | mean development | hubs/system |
  |---|---|---|---|
  | 0.35 | 11.3 | 0.40 | 0.35 |
  | 1.0 *(default)* | 12.3 | 0.52 | 2.2 |
  | 2.5 | 14.2 | 0.61 | 4.3 |

  Hubs swing **12×**, which is where the rural-versus-core feeling lives —
  a frontier galaxy has one highport per three systems, a settled one has
  four per system.

  **Pressure 1.0 is byte-identical to the generator before the knob
  existed**, and there is a test that fails if that ever stops being true.
  It works by biasing a roll (`u^(1/p)`) rather than moving bounds, so at
  p = 1 the exponent is 1 and the same single draw produces the same
  number in the same order. Pressure also deliberately cannot move a
  planet or invent a habitable world — the astronomy is `generate.js`'s
  business — and that is tested too.

- **More planets, and a wider habitable zone.** This changes every system
  in the galaxy. Saves store a seed and regenerate the world, so a career
  keeps its ship, money and record but wakes up somewhere with a different
  set of planets — nothing corrupts, the map simply is not the map it was.

  **Harmless here: no save files existed yet.** Noting it because it stops
  being harmless the moment one does. Any later change to `generate.js`
  needs this heading filled in honestly, which is why the heading exists.

  Three changes, all measured across 40 seeds:

  | | before | after |
  |---|---|---|
  | Planets per system | 4–9 | 6–12 (avg 8.9) |
  | Habitable zone | 0.95–1.67 √L | 0.75–1.77 √L |
  | Orbit spacing | ×1.42–2.05 | ×1.30–1.75 |
  | Habitable worlds/system | rarely >1 | avg 1.27; **2+ in 20/40** |
  | Ports on habitable worlds | 20% | 36% |

  The habitable zone was the binding constraint, and for a geometric
  reason rather than a tuning one: at 0.95–1.67 it spanned a ratio of
  1.76, while orbits stepped by 1.42–2.05 each. **The zone was barely one
  orbital slot wide** — most systems dropped nothing into it and none
  could ever hold two. The new bounds are the optimistic
  (recent-Venus / early-Mars) limits, which is a real pair out of the
  exoplanet literature, and they span 2.36.

  The spacing floor also turned out to be over-cautious. Its comment
  claimed 1.42 was needed for orbits not to cross, but the actual
  constraint at this generator's 0.09 eccentricity cap is
  1.09/0.91 = **1.198**. 1.30 keeps a real margin and fits more worlds in
  the zone.

- **Two of the three unassigned hulls now have roles.**

  **Liner** — a new traffic class. Takes over a light interplanetary run
  that touches a settled world, carrying whatever the manifest says, so
  what you see changes without a single price moving. 11 liner routes
  across 15 test systems, in 4 of them.

  **Navy** — a new patrol class flying the capital hull. Slow (0.006 vs a
  police interceptor's 0.021): it does not chase, it arrives, and anything
  that wants to run from one can. 260 hull points, counts as a deterrent
  against piracy the way police do, refuses to be robbed, and killing one
  is a 12,000 cr charge. Fielded only where a faction has the industry and
  the order to justify it — 1 system in 15.

  Thresholds were measured rather than guessed: `sys.development` runs
  0.28–0.61 across seeds, so an initial 0.62 gate produced zero navies
  anywhere. Likewise a liner requiring *both* ends settled produced zero
  routes — only ~20% of ports sit on a habitable world, about two per
  system, and two different settled worlds in one system is rare. That run
  is an interstellar one, and this game's traffic is per-system.

  **`escape_pod-*` deliberately still has no role.** It is not a ship
  anyone flies anywhere — it is what is left when a ship dies, so it
  belongs with the debris work.

  **The tug's canopy is amidships, not at the nose** — glass at z 0.195
  where every other hull sits at 0.44–0.48. Correct for a pusher, and the
  reason the seat anchor is read from the glass box rather than assumed.

### Known issues

- Missiles are still the flat `ship.missiles` counter and have not moved
  into the slot system. Half a migration is worse than none; the rack
  becomes an internal module in the ordnance phase.

---

## Before this changelog

This file starts at alpha 5. The systems below were already built and
working when it was created — listed so the changelog has a floor, not
dated, because the alpha they each landed in is not recorded anywhere.
**Worth backfilling from memory if you want the history.**

- Seeded galaxy and system generation; the same seed gives the same
  universe every time.
- N-body flight with Kepler rails, time warp, orbital and ship reference
  frames, node planning.
- Atmospheres: drag, re-entry heating, the ablative heat shield.
- Landing, docking, docking clearance and fugitive status.
- Economy, markets, contraband, reactor waste and illegal dumping.
- Missions, faction standing, faction campaign arcs.
- Combat: guns, auto-turret, homing seekers, shields, and the
  witness-based bounty system.
- Slipspace corridor: lanes, wakes, interdiction, deep-space drop-out.
- The cockpit: console MFDs, aft view, pause menu, six save slots plus a
  per-seed autosave.
- WebGL world layer, planet impostors, ship models.
- Electron desktop build for Windows and Linux.

---

## A note on version control

There is no git repository here. That is now the most expensive missing
piece in the project: it is why the render-test question above cannot be
answered, why this changelog has to start with a floor instead of a
history, and why every refactor from here carries risk that a `git diff`
would remove in a second.

`git init` plus a first commit costs about a minute and would pay for
itself the first time something breaks.
