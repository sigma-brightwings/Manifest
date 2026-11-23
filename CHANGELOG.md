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

Releases have a number and a polytope's name. Everything that changes the
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

### Fixed (2026-11-22, a sky when you fly in air)

- **Flying in a world's air there was no sky.** The sky built for the ground ports on 2026-11-02 (gradient, haze, dusk, the overcast ceiling) only came on inside a ground port's cut or within 30 km of a sea platform. Everywhere else, above the horizon was cleared to space: at noon 3 km over Mirven II's sea, a black, starry sky. Found while tuning the cloud dimming. Under a deck, that dimming was going dark against black, which is why every overcast looked like dusk.
  - **Now that sky is drawn wherever the eye is inside a world's air,** at the eye's own vertical, with the weather overhead there. A port's own sky still wins at a port, and nothing changes in the map, underground or in a shed.
  - **It thins as you climb:** the sky is scaled by the air left at the eye (`GLWorld.skyOver` and `setGroundSky` take a `thin`). On Mirven II it is a full blue sky at 3 km, a darkening blue at 30 km, and stars coming out through it at 50 km. Above that it stops and the planet seen from space takes over.
- **The dark wash under a cloud deck is light for plain overcast and heavy for storms.** The sky itself is now grey under a deck, so the wash was a second darkening.
  - Mirven II's ordinary overcast (gloom 0.52): opacity 0.40 before, 0.16 now. A storm (gloom 0.94) is still 0.66.
  - Probe shots at 3 km for clear, overcast, storm and night are in tools/probe-overcast.js.

### Added (2026-11-22, vapour off the tips and over the hull)

Astra, on the cloud work: "if this works, we might be able to do some contrails on ship leading tips / edges for control surfaces in atmosphere." This is the vapour a lifting body pulls out of wet air, not an engine contrail. Lift is low pressure, low pressure is cold, and cold wet air condenses: in the cores of the vortices off the tips, and in a sheet over the lifting side in a hard pull.

- **It follows the pull and the wet** (`Weather.vapourOf`):
  - The pull is what the hull feels across the airflow, in g. For your ship that's the felt acceleration. For an NPC it's her velocity change less gravity, smoothed over a third of a second.
  - The wet is how near the air is to making cloud (`Weather.humidity`), from the same column the murk reads.
  - These hulls have no wing lift, so one that is coasting is in free fall and lays nothing.
  - Measured by flying it (probe-vapour, Mirven II, 250 m/s, vertical and lateral thrusters held, 2.7 g):

    | Air | Coasting | 2.7 g pull |
    |---|---|---|
    | Wet (under a deck) | 0.00 | 0.49 |
    | Dry (high inland) | 0.00 | 0.05, under the cut, so nothing is drawn |
- **Tip vortices:** two thin, short-lived trails (2.2 s) from each hull's real tips (`Sim.hullBox`, her true span), laid every 0.08 s so a hard turn curves smoothly. This covers your ship and every lifted NPC.
- **The sheet:** from outside, a hull pulling hard in wet air wears soft white vapour over her lifting side, streaming aft (`Render.drawVapourSheet`).
- **From the seat**, where you can see neither: vapour streams past the canopy, outward from where you're heading and crowded toward the side you're pulling toward. It is drawn with the weather, under the instruments and without the glass's glow blur.
- The existing trail behind a hull in air is unchanged. Room for trails went from 24 to 48, three per hull.

### Changed (2026-11-22, clouds with a body: lit tops, and a storm you descend through)

Astra asked for clouds that feel volumetric: "the sun properly lighting the tops of them", and "if you go down through a storm, that should be obvious in the weather changing and the view going from clear to reduced visibility as the density of the cloud increases", in layers from the highest cloud down to nearly sea level, cheap enough for the RX 540. Real raymarched volumes are not affordable on that card, so this fakes the parts the eye reads.

- **From orbit, the deck has relief.** One extra look at the cloud field, a short step toward the sun, tells each point whether it is a top or sunward face (lit) or a far flank (in its own shadow). The step shrinks with the sun overhead, so noon lights a deck evenly and a low sun rakes it.
  - **Storm towers** take that shading harder than the ordinary deck, because they stand far above it.
  - **Clouds cast shadows** on the clear ground beside them, from the same lookup.
  - **Thin edges are see-through:** a cloud's ragged edge lets the ground show; its body does not.
  - **Cloud tops keep the light** a little past the ground's terminator.
- **A low layer:** stratus and sea fog, under the deck, cut lower where the air is wet and over water. Measured from the field: about 1% of the sky over dry ground, up to a third over a wet sea.
- **The column has a shape.** At any place, the deck now has a height profile: thin at the top, densest about 40% of the way up, thinner toward the base, then clear underneath. Over a storm, the base sinks and the top climbs (on Mirven II, about 3 km to 41 km). A storm descent on Mirven II, by Weather.aloft:

  | Altitude | Density | Visibility | Gloom |
  |---|---|---|---|
  | 48 km | 0.00 | 1.00 | 0.00 |
  | 38 km | 0.25 | 0.44 | 0.33 |
  | 30 km | 0.54 | 0.18 | 0.74 |
  | 22 km | 0.82 | 0.07 | 0.90 |
  | 14 km | 0.75 | 0.09 | 0.96 |
  | 7 km | 0.48 | 0.21 | 0.97 |
  | 1.4 km | 0.00 | 1.00 | 0.97 (under it, in the rain) |

- **The murk on the glass is graded:** it thickens and thins with that density, is pale near the top of a deck and dark in a storm's heart, and has three soft banks that rise past the canopy as you descend. It is black at night.
- **Rain stops at the top of the cloud.** Over a storm's 41 km anvil, the old fade put rain on the glass at 48 km, in clear air.

Cost, measured on the RX 540 with a cloudy disc filling the glass (5-second averages, two runs each): 32.7 ms a frame without the new lookups, 34.8 ms with them. The first version took 36.3 ms; cutting the sunward look and the low layer to two octaves of noise (the sunward look borrows this point's own fine detail) recovered 1.5 ms of that.

### Fixed (2026-11-22, the weather on the canopy)

- **The dark under a cloud deck was brightening the view.** The canopy's glass pass leaves the canvas in additive mode, and the weather never set it back, so the "darken under the deck" wash was *added* to the scene. That had been true since the wash was written (2026-11-03). Inside a storm, the murk summed to flat white. Found by logging every fill on a probe descent. Both now paint over the view.
- **The weather erased the instruments.** It was drawn last inside the glass, over the HUD. Once it painted properly, a storm's heart hid the ladder, the air data and every box. The weather is outside the canopy and the HUD is projected on it, so the weather now goes on first.
- **Weather drew with the glass's glow blur on**, a shadow blur over a full-screen fill every frame. Inside weather on the RX 540: about 21 fps before, about 30 after.
- **Pausing during a lightning strike held the flash**, leaving the canopy pale white for as long as the pause lasted. No flash while paused.

### Changed (2026-11-22, the weather has a climate)

Astra asked: "weather patterns are modeled, or just faked?" They were faked: one noise field, cut at one level per world, so a desert coast was as likely to be overcast as an ocean. She wants them modelled because the data is to be sold to the planners of new stations. This is slice 1 of that plan (claude/climate-and-met-data.md): the model.

- **The cut now depends on where you are**, by a planet's general circulation (`Weather.climateWet`, every number in `Weather.K` as `CL_*`):
  - **The rain belt** sits under the sun and follows it north and south with the seasons, part of the way.
  - **The dry belts** at about 30° are where the risen air comes down dry, which is where deserts sit.
  - **The storm tracks** sit at about 57°.
  - **The poles** are dry, cold air holding little water.
  - **Open water** feeds cloud, and high inland ground starves it.
  - **Slopes:** the prevailing wind (trades from the east in the tropics, westerlies in the middle latitudes, easterlies at the poles) is lifted up a windward slope and rains, then comes down the far side dry, the rain shadow.
  - **Ice** holds little water.
  - **Storms** start more readily in the wet belts.
- **Seasons are real:** the rain belt moves with the sun's latitude on the world at that moment. A world tilted 31° has a sun that wanders from −31° to +31° over its year.
- **Each world keeps its cloud.** The multiplier is divided by its own mean over the sphere, per world, so climate moves cloud around a world without adding or taking any. The generator's cloud column still means what it was tuned to: the worst world is 1.5% off.
- **Who has none:** giants, twilight worlds and airless rock keep the old behaviour exactly.
- **One sky, everywhere:**
  - the shader runs the same function from the same numbers (`climateWet` and `elevFixed` in gl.js, with `uClimate` and the season from `uSunDir`);
  - port forecasts, the weather aloft and the ground sky pass the climate to `sample()`.
  - The picture, the forecast and the climate record a sounder will build all agree.
- **Measured** (tools/measure-climate.js, 60 systems), cloud by |latitude| band (0–13°, 13–26°, 26–39°, 39–52°, 52–65°, 65–78°, 78–90°):
  - terran worlds: 41%, 22%, 13%, 31%, 28%, 12%, 7%. Wet tropics, dry subtropics, cloudy storm tracks, clear poles. Sea is 27% clouded against land's 21%.
  - Ocean worlds run 54% at the equator down to 11% at the poles.
  - Deserts and iceballs barely change: their cloud column is too low for the cut to move.

**Saves.** Nothing is stored. The weather at any hour is still a pure function of the world, the place and the time, so the same hour has the same sky. But it is a different sky from before: cloud has moved off the dry belts and onto the rain belt and storm tracks.

**Tests.** New climate.test.js (19 checks, core group):
- the belts' order, and the rain belt following the sun;
- sea wetter than high land, windward wetter than lee;
- the prevailing wind's direction by latitude;
- every world's mean multiplier is 1 (55 worlds);
- no climate term on giants, twilight worlds or airless rock;
- seasons span the tilt;
- the shader, read as source:
  - it carries the same function;
  - all 21 climate numbers it uses exist in `Weather.K`;
  - both the cloud cut and the storm threshold read it;
  - the season is the sun on the spin axis;
  - gl.js hands it the world's own mean.

weather.test.js: its source check of main.js's `Weather.overhead` call now expects the system to be passed (64 pass).

**Seen in the real build** (tools/probe-climate.js, X:\Shared_AI\climate). Over Mirven II's north storm track the climate reads wet 1.38, the forecast at the sub-ship point reads cloud 0.90, and the picture there is cloud. Over the equator the climate reads wet 1.72, with clear sky under the ship at that hour, and the picture is clear there too. The shader compiles and draws.

### Fixed (2026-11-22, ice caps on the surface map read as untextured)

Astra: "the ice caps read as untextured." The planet picture gets its texture from the sun across the relief and from ground-detail mottling, and a flat map has neither, so a cap came out as one flat white. Worse, the relief the map did have was only applied to dry land, and a polar cap on a wet world is nearly all sea underneath, so the cap had no texture at all.

`Survey.surfaceMap` now adds two terms from the same elevation field the planet is painted from:
- **Hillshade:** the slope toward a light from the north-west, from the field a quarter-cell east and north of each cell's centre, within ±25%.
- **Mottle:** the field at six times the frequency, the grain of sastrugi and melt ponds. It is stronger on ice and faint on rock. Ice also turns a faint blue-grey where the mottle runs low, as the picture's ice does.

Pack ice over a sea now counts as ground for this, so it gets the texture too. Land gets the same hillshade and so reads with more relief. The land, sea and ice classes are unchanged, so coastlines don't move. One surface map now takes about 260 ms to build, once per world.

**Seen in the real build** (tools/probe-globe.js, X:\Shared_AI\globe): Mirven II's north polar cap, looked down on from the globe, is mottled and shaded under both the resources and the magnetic layers.

### Added (2026-11-22, the scanner map on a globe)

Astra: "can we wrap the gridmap onto a globe?"

- **A GLOBE / FLAT button** sits in the scanner's top row, after INTERIOR, and O does the same. It works on the RESOURCES, MAGNETIC and BOTH layers; GRAVITY and INTERIOR are cuts and stay as they are. It starts FLAT.
- **Everything on the map is on the globe.** The flat map is drawn whole at 1x into an offscreen texture (4 px a cell), with the readouts, surface, graticule, deposit glyphs, magnetic rings, field lines, drones, outposts, digs, ground track and ship. That texture is then wrapped onto a sphere, so the globe can never show something the map doesn't, or miss something it does.
  - The globe is drawn orthographically, as seen out of a window, with the limb darkened and the edge lit like the cutaways'.
  - Shapes the flat map has to stretch come back true on the globe: a province's ellipse becomes the circle it is.
- **Turning it:**
  - The arrows turn it 15° a press: → brings the east round to face you, ↑ tips the north toward you.
  - SWEEP FOLLOW keeps the ship's ground point facing you.
  - The centre longitude and latitude are written under the globe.
- **Pointing works.** The hover readout and click-to-pin project back through the sphere to the cell under the pointer, and the selected cell is marked on the globe. Off the disc, or on the far side, nothing is picked. In the probe, 187 points sent to the screen and back landed within 3e-12°. The probe checks that projection, not a real click.
- **Cost.** The pixel-to-texel table is cached per view and only rebuilt when the view moves half a degree. A still globe costs one pass over the table a frame. In the probe window (not representative hardware), a still globe frame took about 25 ms and a turning one about 35 ms.

**Saves.** Unchanged: GLOBE is a screen setting, like SURFACE.

**Seen in the real build** (tools/probe-globe.js, X:\Shared_AI\globe). Mirven II with its northern two-thirds swept and TRUE COLOUR on. O and the arrow keys were pressed through the game's own key handling.
- On the resources layer, the ore-rich peninsula shows in radar colours on its own land.
- Turned east and tipped north, the ice cap's edge rings the pole.
- On the magnetic layer, the two province highs sit on their land as circles, and the unswept south stays dark.

### Added (2026-11-22, the surface under the scanner's readout)

Astra: the scanner readout should be superimposable on a map of the surface, switchable, and shown only where you've flown.

- **A SURFACE button** at the top of the scanner's side panel, beside LEGEND, cycles OFF → TRUE COLOUR → OUTLINE. V does the same. It starts OFF.
  - **TRUE COLOUR** is the planet as it looks from orbit, dimmed under the readout: its biomes, seas and ice caps, with a little relief.
  - **OUTLINE** is flat land, sea, ice and lava.
  - A giant has no surface, so it shows its cloud colour in latitude bands.
- **Only where you've flown.** The surface fills in on the cells your scanner or magnetometer has swept. Unflown ground stays the dark checker.
- **The readout goes over it part-transparent**, so both show: the magnetic ramp at 60% of its old strength and the resource colours at 65%. "Flown, nothing worth digging" no longer paints over the ground.
- **Coastlines and ice edges are drawn on top of everything** as a thin pale line, so the shape of the land survives any readout.
- **One coastline.** `Survey.surfaceMap` asks `Weather.terrainAt`, the same arithmetic the planet picture is painted with and the same one the ground map's water came from. Its coasts are the coasts you see from orbit, and a deposit on the map sits on the land it's on. It is cached per body and nothing is saved.

**Saves.** Unchanged; the switch is a screen setting.

**Tests.** magnetics.test.js gains 3 checks (25 in all):
- the surface map's land, sea and ice agree with the ground map's in all 55,548 sampled cells;
- it is cached;
- a giant gets bands.

**Seen in the real build** (tools/probe-surface.js, X:\Shared_AI\surface). Mirven II, terran, has its northern two-thirds swept. Coastlines run under the magnetic layer, the two ore provinces' highs sit on the land patches the resources layer shows ore on, and the south stays blank. V was pressed through the game's own key handling.

### Added (2026-11-22, planetary interiors slice 4: the INTERIOR cutaway)

The plan's slice 4 (claude/planetary-interiors.md). Astra's decision 6 makes this its own scanner layer, a picture of the rock, apart from the GRAVITY slice, which is a picture of the field. Open it with the INTERIOR button or the I key. 1/2/3 pick the XY/YZ/ZX cut, as on the gravity slice.

- **It draws what your kit can tell apart, never the true interior** (`Interior.measured`). Layers the instruments can't separate merge into one band, so a boundary you haven't measured leaves no edge behind to give it away. A world nothing has read is one hatched band marked "unmeasured".
- **What each gravimeter grade adds:**
  - grade 1: the core, against everything above it;
  - grade 2: the crust, or on an icy world the low-density lid, "ice, perhaps water";
  - grade 3: water under the ice, and the mantle's state (convecting, solid, or a magma ocean);
  - grade 4: the inner core inside the outer.
  - On a giant: grade 1 shows fluid over a core, and grade 2 separates the envelope from the deep fluid.
- **Depths carry their error:** ±25%, 15%, 7% and 3% of the depth at grades 1–4, e.g. "5,250±150 km". Depth is pinned far more tightly than the gravimeter's sideways resolving length, because a whole shell of rock pulls together. The drawn edges are as soft as that error.
- **The magnetometer adds, once a quarter of the world is swept:**
  - the Curie depth, as a dashed ring;
  - a liquid core, but only where a dipole and the interior's dynamo agree. Until slice 6 rebuilds the field from the core, a rolled field over a dead core is not claimed as liquid;
  - an induced field on an icy moon of a magnetised giant. Something under the ice conducts, so the ocean shows at grade 2 (Europa, in our own sky).
  - A magnetometer alone draws no boundaries, because only gravity sees density steps. It still gives the Curie depth and its notes.
- **Contacts on the cut:** gravity contacts as warm rings (violet for a low) and buried magnetic highs as cyan diamonds, each at the depth it was read at. They fade when the cut barely touches them.
- **The panel** lists the layers with their depths, what the field says, and what the next instrument up would add.
- **The look:** the cut edge glows like the other cutaways', and the axes are arrows. Layers too thin to see, such as a 75 km crust on a 9,600 km world, are drawn at least 3 px thick, and the footer says so.

**Saves.** Nothing new is saved: it is all computed from the seed and the survey record.

**Tests.** New interior-cut.test.js (19 checks, ground group). Over 598 worlds:
- with no instrument, every world is one unmeasured band, and a magnetometer alone draws no boundaries;
- every edge drawn is a true edge, with no two neighbouring bands alike, and a finer grade never shows fewer layers;
- each grade adds what it should;
- the Curie depth appears only once a quarter is swept, and lands within 1 km of the truth;
- a liquid core is claimed only where dipole and dynamo agree (15 worlds), and never over a dead core (30 worlds);
- the induced ocean shows at grade 2 on all 20 ocean moons;
- a finer grade quotes a smaller error, and the core top lies within its quoted error.

**Seen in the real build** (tools/probe-interior.js, X:\Shared_AI\interior):
- Mirven I, a desert world: rock over a core at grade 1, 5,250±1300 km down; crust, mantle and core at grade 2; at grade 4 the crust (75±2 km), a convecting mantle, an outer core and a solid inner core.
- Mirven VI: envelope, conducting metallic hydrogen, and a core.
- A magnetometer alone: one hatched disc, with the Curie depth noted.
- The starting system has no ocean moon, so the induced-ocean case is checked by the test only.

**Fixed on the way:** the hatching left the lower-left of the disc bare. Its lines now start far enough left to reach that edge.

### Fixed (2026-11-22, a stale test: escorts were counted as patrols)

The full suite on ship AI slice 5 (full-suite5) was 143 of 144 green. The red one was economy.test.js, "the most permissive systems are patrolled thinner than the strictest". It counted every police-kind ship in `sys.patrols`, and slice 5's escorts are stored there too. Across its 150 seeds, the strictest third has 2.41 real patrols per faction and the most permissive 1.73, so the rule still holds. But escorts run 0.92 per faction against 2.05: Syndicate heavies ride with runners, and the permissive systems are the busy ones. That tipped the total over. The test now leaves out ships that are `escorting`, since they go where their charge goes rather than patrolling. economy.test.js: 208 pass. No game code changed.

### Changed (2026-11-22, planetary interiors slice 3: the magnetometer hears the interior)

The plan's slice 3 (claude/planetary-interiors.md). The magnetic anomaly used to be the ore-grade map: every metal province was a bump, whatever it was made of and however deep. It is now built from the interior's bodies (`survey.js magSources`, `magMap`).

- **Only what can hold a magnetisation is heard.** Iron reads full strength, sulphide half, the rare-metal mixes faintly (0.15). Fissile, ice and salt are silent. Nothing below the Curie depth is heard, because rock that hot can't stay magnetised.
- **A province** is ore spread through the crust over its whole patch, so it reads as a broad rise the width of the patch. An iron province reads what the old ore anomaly read at its centre.
- **A buried body** is a lump. Its high is about as wide as it is deep, and its strength falls as (size/depth)³, the dipole law. A deep body is much quieter to a coil than to a gravimeter, which loses only the square. A high is never narrower than one cell, so it can't fall between cell centres.
- **Remanence.** On a world whose dynamo has died, 3–7 broad, faint patches of old field are frozen into the crust (like Mars's southern highlands). No ore lies under them. They are on the map but never in the contact list.
- **Measured before switching** (tools/measure-magnetics.js, 120 systems, 2,177 worlds with ore). Of 7,598 province highs:
  - 3,564 keep their strength (or never showed);
  - 3,851 weaken, mostly rare-metal and sulphide provinces;
  - 183 vanish, all of them below the Curie depth on hot worlds.
  Of 2,918 buried bodies, 924 now raise a high of 500 nT or more, which the old map never showed.
- **The magnetometer has a contact list**, beside the gravimeter's (`Survey.magContacts`, `describeMag`). On the MAGNETIC layer it replaces the deposits list as MAGNETIC HIGHS. It shows readings only (decision 2): "+5.2k nT · about 68 km down" for a lump, judged from the width of its high; "+11.4k nT · broad, 190 km wide, shallow" for a province. It never names a composition.
  - It lists only highs over ground the coil has swept, loudest first, and nothing under 100 nT.
  - A province the spectrometer also reads is explained, as on the gravimeter. A buried body never is, and gets a "!" and a warm colour.
  - Click a row to pin it and walk the map there.
- **Rings on the map** mark each high: warm if unexplained. A province also gets a dashed ellipse the size of its patch, stretched east–west toward the poles as the patch itself is on this projection.
- **The cell readout** adds the rock's own part of the field, e.g. "+3400 nT", after the total.
- **The panel** says "no dipole: only what the crust holds", and "remanent crust: old field frozen in the rock" where that applies.
- **Units.** 1.0 on the field scale is 50,000 nT (`Survey.NT_PER`), an Earth-strength polar field.

**Fixed on the way: the scanner map at 1x lost everything drawn on top of it.** `scanSX` takes the short way round the seam. Its test, `dx > nLon - vc`, becomes `dx > 0` when the whole world is in view, so every column but the first was thrown off the left edge. At 1x that meant no deposit glyphs, no meridians, no longitude labels and no field lines, and it had been that way since 1.3.1. It showed up when the magnetic highs wouldn't draw. Now a column moves to the left only when it is nearer there than off the right edge.

**Saves.** Nothing stored changes: the field is computed from the world, and a magnetometer record still marks only which cells were swept. An old save sees the new highs over ground it has already flown.

**Tests.**
- New magnetics.test.js (22 checks, ground group):
  - building the field moves nothing, and the same seed gives the same field;
  - every source is magnetic and above Curie; ice, salt, fissile and giants are silent;
  - a buried body reads as (size/depth)³, and its high stands over it (145 of 145);
  - deeper bodies of the same make are quieter;
  - remanence appears only where the dynamo has died, and is never a contact;
  - contacts are readings only, loudest first, none under the floor, none over unswept ground, and buried ones are never explained.
- magnetometer.test.js loads the interior. A "dead rock with anomalies" is now one with a magnetic province; a "silent" world is one with nothing magnetic in it and no remanence.

**Seen in the real build** (tools/probe-maghighs.js, X:\Shared_AI\maghighs). Mirven I b, which has no dipole, shows six highs: five provinces and one unexplained buried body at +5.2k nT, about 68 km down. Mirven IV shows its remanent patches as faint blue washes under two province highs.

### Changed (2026-11-22, planetary interiors slice 2: the gravimeter reads lows, and giants hold no lumps)

The plan's slice 2 (claude/planetary-interiors.md). Astra's decision 3: buried ice and salt read as dips.

- **Gravity is signed** (`gravity.js anomAt`, `surfaceSignal`, `slice`, `contacts`). A body lighter than the rock around it is a mass deficit: its reading is negative, and a contact carries `low`. The instrument's sensitivity is to the size of a reading, so a −131 mGal low shows on a grade that reads to 70. Contacts are ordered by size, high or low.
- **Light bodies.** `Gravity.lightBodies`, all hashes, no draws:
  - **Buried ice:** the poleward patches the water map already laid on dry worlds, each now with a depth (0.5–12 km) and a size.
  - **Salt:** 0–2 evaporite bodies under desert worlds only, 1–20 km down.
  - Never inside an ice shell, where ice in ice is no contrast.
  - Over 24 systems: 156 ice and 27 salt bodies, and 181 of them read as lows at grade 4.
- **A reading, not a verdict** (decision 2). The line says "-131 mGal low, 8.3 km down, 10 km across, needs a drilling team", and its head says "buried", the same as any body no spectrometer can see. The game never says "ice".
- **What can explain a low.** A shallow ice low is explained by a kit that reads water, because the water map shows that patch. Deeper ice and salt are never explained.
- **The slice shows dips.** The lateral-anomaly picture used to clip everything below zero. Lows now draw cold, violet darkening into the blue well, the opposite of the warm heat a dense body raises. Their contact rings are violet.
- **The footnote** no longer says "something heavy": a high is mass, a low is mass missing.
- **A giant holds no lumps.** The ground map lays provinces and buried bodies on every world, and the gravimeter used to pass them all on, so it read ore inside a gas giant's hydrogen. Giants now have no gravity sources, matching the interior. A giant's page says so: "No rock here to hold a lump." At grade 4, an empty world no longer suggests a finer instrument.
- **One list.** `Interior.of` now takes its masses, ice and salt included, straight from `Gravity.sourcesOf`, with the same hashes slice 1 used. The interior and the gravimeter can't disagree about what is down there.

**Tests.**
- interior.test.js gains 8 checks (28 in all):
  - giants have no sources;
  - ice and salt are sources, salt only under deserts, and never in an ice shell;
  - lows read negative and are flagged;
  - the line says "low";
  - shallow ice is explained by a water reading, salt and deep ice never;
  - the slice dips below zero (-36.7 mGal deepest in the sample);
  - the interior's list is exactly the gravimeter's.
- gravity.test.js: "nothing below the rung's sensitivity" now means the size of the reading, high or low (44 pass).

**Seen in the real build** (tools/probe-gravlows.js, X:\Shared_AI\shots-gravlows). On Mirven II b the strongest low reads −131 mGal, and its violet ring sits at the limb. Mirven VI, a gas giant, reads nothing.

### Added (2026-11-22, the ship scanning you is highlighted)

Astra: "when scanned by another ship, like a warden, that ship should be highlighted."

- **On the glass.** A patrol coming in to scan you (in inspect, not yet done, within 300 km), or a warship that has ordered you to heave to, is boxed in amber with a second set of brackets outside the first that pulse. Its label reads "SCANNING YOU · interceptor · 41.95 km". Amber because it is neither friendly green nor hostile red: it is the one ship looking at you.
- **In the contacts panel** it reads SCANNING YOU, or HEAVE TO ORDERED, in amber.
- **Labels keep clear of the outer brackets** (`Render.placeHoloLabels` takes a `pad`), both its own name and a neighbour's.
- Tests: panels.test.js gains two checks (15).

### Fixed (2026-11-22, the contacts panel: rows that ran into each other, and everyone "escorting")

- **The panel is as wide as its longest row.** "The Notary (Syndicate enforcer) 2,500 km ATTACKING" pushed its status onto a second line, which the panel's height did not allow for, so it ran into the row below. The panel now takes the width its rows need, from 380 px up to half the glass.
- **Everyone was "escorting".** That was the last word for any awake ship with no other status, so a port tug and a navy cutter answering an alarm both said it. A tug or tender now says "standing by", a navy ship on a job says what the job is, and anything else says "keeping watch". Mercenaries and the new escorts still say "escorting".

### Added (2026-11-22, ship AI slice 5: navy and Syndicate doctrine)

claude/ship-ai-profiles.md section 7, item 5. Astra's calls:
- protection: "both", live near you and in the prices and gossip;
- escorts: heavies ride with runners, and the navy escorts liners;
- grudges: "a hit squad comes";
- the navy at a hit platform: "subdue and question anyone near the platform who could've done it. They will attempt to disable, but they will not hesitate to escalate their use of force if resisted."

**Escorts** (`generate.js buildEscorts`, its own seeded stream, so nothing else in a system moves):
- **Runners.** A Syndicate runner working a lawful fence takes a heavy with her 15% of the time in a clean system, up to 40% in a crooked one.
- **Liners.** In an empire system with law in its sky, 30% of liner runs fly with an escort: the navy's own warship if the system has a navy, otherwise a police interceptor ("Shepherd 14").
- **The outlaw cap still holds.** Outlaws never outnumber the law in lawful space, so liners get their escorts first and heavies ride only within what that leaves. Names never repeat: once a name list runs out, the next is numbered ("The Underboss 2").
- **An escort and her charge are one flight** (`ShipAI.orgOf`, any `escorting`), and a woken escort keeps watch rather than leaving her charge to scan you.

**Escorts actually alongside** (`Sim.railState` / `escortState`). An escort used to fly her own copy of her charge's timetable, a minute behind, on a path shaped by her own drive. Measured over 30 systems, that put her a median **16,500 km** off her charge and up to 200,000 km. The existing mercenary escorts had the same problem (median 18,700 km). An escort's position is now her charge's position at that moment, 6 km astern and 2.5 km to one side: **7 km every time**, still worked out from the clock. This also fixes the mercenaries.

**The hit squad** (`hunters.js`, a third ledger, `G.grudge`, saved):
- **What starts it.** A REPORTED wrong against Syndicate traffic (their runners, whatever her papers say, plus heavies, enforcers and their systems' traffic) adds points: hold-up 20, assault 12, kill 40, killing a heavy 60. An unidentified hull (the shroud) gives them no name.
- **When they come.** At 40 points the word goes upstairs ("That was Syndicate traffic. Somebody upstairs will hear about it."). Two days later, in **any** system, half an hour after you arrive and once you are out of dock, two enforcers drop out of slipspace 2,500 km behind you: "Somebody upstairs would like a word. They are not here for a tithe." Three come at 120 points. Names: The Auditor, The Notary, Final Notice, Courtesy Call, Account Closed…
- **It never fades.** Leave a system and the next one sends them again. Kill them and, if it is reported, the grudge grows.
- **A fixer squares it** ("Can you square me with the people upstairs?") for 3,000 cr + 150 per point. That clears the grudge and their warrant, but not your standing with them. A fixer who otherwise won't deal with you will still take this one errand. Nobody carries the message for a marked pilot. The fixer's "is anyone looking for me?" now covers it.

**The navy answers a platform** (`milsats.js`):
- **The alarm.** A defence platform that is hit, or destroyed, raises an alarm. The nearest warship answers, the navy's own first even when a police cutter is closer, and flies to it.
- **The order.** At the scene she looks for anyone within 3,000 km. Finding you: "You there - heave to for questioning about the attack on DP-1 Coldwater Relay." Hold position and she comes to you. Gone, and she finds nobody and stands down.
- **The questions.** Inside the scan's own range (60 km), matched for 4 s:
  - transponder on, they already know it was you, and fine you on the spot if you can pay;
  - running silent, guns fired within 15 minutes of the attack are "still warm", and you are charged by name;
  - cold guns, and you go with a note on the file.
- **Subdue.** Run (drive lit and the range opening for 15 s, or 25 km further off than when she called) and she opens disabling fire: guns, no missiles. She holds fire once your hull is under 35%, and comes in to talk at gunpoint.
- **Lethal.** Fire on her at any point and the gloves come off.
- **The platform holds its fire** while she has you under orders, unless you shoot it again.
- **Warm guns.** Firing a weapon now stamps `G.lastFiredAt`. A mining laser doesn't count.
- **Not yet:** questioning NPCs found near a platform. Today only your guns can hit one.

**Protection** (`aggression.js protection`, `tithe.js`, `dialogue.js`):
- **Live near you.** In a Syndicate system, a Syndicate patrol passing an independent hull (one from a port that isn't theirs, and not a runner) collects 4% of her cargo's value: "The Patron collects 45,850 cr of protection from the Fenwick Wain - 'the overboss thanks you for your custom'". A captain with enough greed and nerve, and a gun, refuses and is roughed up: 30% of her hull, never below a fifth, and she runs. Each collector collects once per 15 minutes, and each hull pays once a week.
- **In the prices.** An independent port in a Syndicate system passes the cut on: 3% dearer to buy from, 3% meaner to sell to.
- **In the gossip.** "The overboss's collectors take four in the hundred off every independent hull here," or, after someone has refused, "They are still patching her drive housing."

**Found by the probe, fixed** (tools/probe-doctrine.js, shots in X:\Shared_AI\shots-doctrine):
- **Shot to pieces while doing as told.** Sitting still as ordered, the probe's ship was destroyed by the platform it was being questioned about. Fixed: the platform holds fire while the warship has you under orders.
- **Held still and shot anyway.** A navy cutter needs about three minutes to close 60 km, and the first version allowed 90 s before "failure to heave to". Then the range opening because *she* drifted was being counted as *you* running. Fixed: running now means your drive is lit and the range is opening.
- **Questions that never came.** The first questioning range was 2 km, but the law holds 45 km off to scan, so she backed away and never asked. Now the scan's own rule applies.

**Tests.**
- test/doctrine.test.js (53 checks, combat group):
  - escorts add nothing else and stay in their lanes;
  - the grudge, the squad's timing, dock-waiting, size and arrival, and settling it;
  - the alarm's choice of ship, the order, holding still, drifting versus running, subdue and holding fire (with a control that fires), the three verdicts, lethal, nobody found, no law at all, and the platform holding its fire;
  - protection collected, once at a time, once a week, refused by the right captain;
  - the price cut in a Syndicate system, and nowhere else.
- **Three older tests had frozen the old world, and were updated to say so.**
  - turncoats.test.js caught real breaks (outlaws outnumbering the law, a duplicate name), fixed in the code.
  - tithe.test.js asked about a lawful port while passing a Syndicate system as the system; it now checks both cases.
  - syndicate-fleet.test.js said heavies fly only in Syndicate systems; heavies riding with runners are counted on their own.

### Added (2026-11-22, planetary interiors slice 1: one interior per world, data only)

Astra brought the plan (project doc claude/planetary-interiors.md): "make the magnetic field of a surveyed planet correspond to the rest of the planet's features." Until now gravity knew a core and the magnetometer knew a dipole, and the two had never been introduced. Slice 1 builds the one interior that every instrument will read. **Nothing reads it yet, so nothing in play changes.**

**Decided with Astra today:**
- The field follows the interior: the dipole is rebuilt from the core in slice 6.
- A contact line shows readings only. A "probable X" label unlocks with better kit or Guild standing.
- Buried ice and salt read as dips on the gravimeter.
- There is a Curie depth: below it rock is too hot to stay magnetised, so iron there is heavy on the gravimeter and silent on the coil.
- A drill confirms what a body is made of.
- The cutaway is its own scanner layer, INTERIOR.

**`src/interior.js`, `Interior.of(body, sys)`** (new). Pure and seeded from hashes, with no rng draws, cached per body. It gives each world:
- **Layers, outside in:** crust (or an ice shell, with a water ocean under it where tides keep it warm), mantle (convecting, solid, a magma ocean, or water or solid ice), outer core and inner core. Giants get an envelope, metallic hydrogen or an ionic ocean, and a rock-and-ice core.
- **The core is gravity.js's own.** `rc` and `kc` are taken from `profileOf` unchanged, and the new layers are names on that same two-density profile, not extra weight. Giving the crust its own density would have moved g, and every gravity contact with it, on every world.
- **Heat:** from type, size (a big world keeps its heat) and tidal kneading (a moon of a giant). Heat decides how much of the core is still liquid. Earth-like heat gives an inner core about a third of the core's radius, close to Earth's.
- **A dynamo** needs a liquid outer core at least 0.08 of the radius thick, and a dynamo number (shell × heat × spin) of at least 0.4. The spin weights are the old roll's (×1.2 fast, ×0.7 slow, ×0.6 tidally locked). A magma ocean is nearly as hot as the core under it, so little heat leaves the core and a molten world's dynamo is weaker (×0.6). Giants always have one. `drive` (0–1) is how hard the dynamo runs. It is not yet a field strength: slice 6 turns it into one using buildMagnetospheres' own draws.
- **The Curie depth** comes from type, shallower on a hotter world: about 19–43 km on terran worlds, 1–6 km on molten ones, and through the shell into the rock on icy ones.
- **Old magnetised crust** (`remanence`) on some worlds with no dynamo, the way Mars has patches.
- **Every mass, tagged with what it is made of:** each gravity source (provinces, fissile hotspots, buried bodies), plus the buried ice the water map already knew about, which now gets a depth and a size.
  - Fissile hotspots are fissile-bearing.
  - A body whose rare-metal share is over 0.55 is heavy rare-metal. That is the same test grade IV uses for "dense for its size", so the two can't disagree.
  - The rest are iron-nickel (60%) or sulphide.
  - Ice is lighter than the rock around it. Ice inside an ice shell is no contrast, so it isn't listed.
  - Each mass records whether it lies above the Curie depth and could be heard by a coil.

**Tuned by measuring, over 2,576 worlds in 120 systems** (`tools/measure-interiors.js`). The first guesses gave desert worlds a field 1% of the time (17% today) and molten ones 98% (15% today). After tuning:

| type | field today | dynamo |
|---|---|---|
| terran | 52% | 55% |
| ocean | 54% | 57% |
| tundra | 35% | 38% |
| desert | 17% | 19% |
| molten | 15% | 40% |
| rocky | 17% | 0% |
| moons, iceballs | 1–9% | 0% |
| giants | 100% | 100% |

The shares now roughly match today's, but they come from the planet instead of a dice roll. So the worlds that have one aren't the same worlds: about two-thirds of terran and ocean worlds agree. 83 worlds with ports would gain or lose a field when slice 6 lands, and each will be named in its changelog entry.

**Small additions to survey.js:**
- `groundMap` keeps its buried-ice patches as `buriedIce`. Nothing in survey.js reads them, so the maps are unchanged.
- `typeKey` is exported, so the interior and the ore table agree on what a world is.

**A seam found, not yet fixed:** `Gravity.sourcesOf` lists ore provinces and buried bodies on gas and ice giants too, so the gravimeter can read solid lumps inside a gas giant. The interior gives giants none. Fixing gravity is slice 2's job, when sources get signed.

**Tests.** test/interior.test.js (20 checks, ground group):
- The same seed builds the same interior, and asking for one changes no body and no system.
- The profile is gravity.js's own.
- The layers tile each world without a gap.
- Every rocky dynamo has a liquid outer core, and every giant has one.
- Every gravity source on a solid world is in the interior, with a composition matching the grade IV tell.
- Nothing below the Curie depth is magnetic.
- Earth-like worlds often have a dynamo, and dead rock and moons rarely do.

packed (12), packed-browser (16), survey (44), gravity (44), magnetometer (21), magnetosphere (20) and ground (36) still pass.

### Changed (2026-11-22, no name over a name: ship labels and the contacts panel keep clear)

Astra: "build the no overlap rule in." The no-overlap rule the dashboard screens and panels already follow now covers the names on the glass and the contacts panel too. The screenshots showed three problems: two ships 20 px apart printing their names through each other ("Warden 15 / interceptor" through "Tallow Lighter / shuttle"), a cop's name written across the speed readout, and the CONTACTS box sitting on the heading tape.

**Ship and target names** (`Render.queueHoloTarget`, `drawHoloTargets`, `placeHoloLabels`):
- **Placed together.** The boxed targets (nav lock, dock target, every ship awake) are queued for the frame and placed in one pass. Hostile ships go first, so they keep the spot beside their own box.
- **Every ship's box is reserved first,** so no name can land on another ship's box.
- **Where a name goes.** It tries beside its box, then the other side, then above and below, then rows further out. It takes the first spot clear of other ships' boxes, other names, the cockpit's readouts, any panel on screen and the planet and port names.
- **A moved name gets a thin line back to its box,** so you can still tell which name belongs to which ship.
- **No change when nothing is crowded:** a lone name sits exactly where it always did. Off-screen targets keep their edge arrows.

**The contacts and interdiction panel** (`Render.freeSpot`):
- **Off the instruments.** In the cockpit it now takes the first spot that doesn't cover an instrument or another box: where it was, then beside the heading tape, then under it.
- **Kept off the bank arc too.** The cockpit's list of instrument areas now includes the bank arc, which the role panel already avoided. The contacts panel's first fallback spot under the tape would otherwise have covered it, and planet and port names now keep clear of the arc as well.
- **If nothing is clear,** it stays where it was.

**Tests and probe.**
- test/panels.test.js now has four more checks (13 in all). Four boxed ships close together, with one beside the speed readout, end up with no name on another name, another ship's box or the readout. A lone name stays where it was, and one at the edge of the glass flips to the other side rather than running off it.
- The crooked-law probe, re-run, shows Warden 15's name moved to the far side of her box and the Tallow Lighter's on hers. The contacts panel now sits clear of the tape and the bank arc, under the cargo box.
- airdata.test.js (73) and cockpit.test.js (244) still pass.

### Added (2026-11-22, ship AI slice 4: the crooked law)

The fourth slice of the ship AI (claude/ship-ai-profiles.md §3 and §7 item 4). Until now, whether an inspector took a bribe was a dice roll on the system's corruption. Now it depends on the inspector herself: her own probity (which the system's corruption pulls on but doesn't set), and whether anyone honest is watching.

**The scan** (combat.js `resolveScan`):
- **Laxity.** A crooked cop searches less often (× 0.6), and an undisciplined one less again (× 0.7–1.0).
- **The quiet word.** When contraband turns up, a crooked inspector takes a bribe only if no other lawful patrol is within 30,000 km. An honest one never does, in any system. A crooked one with a colleague in sight writes it up like anyone else. This can now happen even in a clean system, where before nobody ever took a bribe.

**The shakedown** (Astra: pay, refuse or report). In a bought system (corruption 60 or more), a crooked cop alone with you wants an "inspection fee" whether your hold is clean or not. That's about 3% of your cargo's value plus 2% of your credits, scaled by her greed, and never under 80 cr.
- **The INSPECTION FEE panel** shows her ask and a countdown. Time runs at 1× while she waits.
- **C pays.** She waves you on, and the system gets a little more bought.
- **X refuses.** She searches you properly with no bribe on offer. If she finds nothing, she cites you anyway for "an obstructed inspection" (60–240 cr, by her greed). Saying nothing for 25 s counts as refusing.
- **Z reports her.** This is a gamble on someone straight being left to hear it. The odds are better when an honest cop or the navy is in the system, and worse the more bought the system is.
  - **Upheld:** she is recalled and stays off the lanes for a month, even across arrivals and reloads (`G.suspended`), and your standing with her force rises by 2.
  - **Not upheld:** your standing with her force drops by 6, and you're marked for 30 days (`G.troublemaker`). Every crooked cop in that system searches you every time.

**On the lanes** (aggression.js, Astra's three targets):
- **NPC traders.** In a bought system, a crooked cop with no colleague in sight shakes down the traders she scans ("Warden 15 holds the Tallow Lighter for an 'inspection' - 840 cr changes hands and she waves her on"). The trader resents it (her mood takes a "robbed" event). A cop does this at most once every 15 minutes.
- **Syndicate runners.** A greedy crooked cop (greed 0.35 or more, roughly the top sixth) will lean on the Syndicate's own runners, and the Syndicate answers as if she'd fired on one.
- **The straight cop.** A cop with probity 0.7 or more, in a system that isn't bought, runs a Syndicate runner down: "I know whose ship this is. Your friends do not pay me."
- **The dock talks.** A cop who has taken money more than once, or from the mob, gets named in dock gossip (`G.onTheTake`).

**Saves.** `troublemaker`, `suspended` and `onTheTake` are new fields, so an older career loads with none of them. No version bump.

**Tests and probe.** New test/crookedlaw.test.js (35), in the combat group. tools/probe-crookedlaw.js ran it in the game at Mirven, with its corruption set to 80 for the run:
- Warden 15 (probity 0.34) asked 180 cr. Pressing C paid it and she waved me on.
- The second time she asked 170 cr. Pressing X refused, and she cited me 92 cr.
- She then shook down the Tallow Lighter for 840 cr. The contacts list now says "waved on" for a trader let go like that, instead of "fleeing".

### Added (2026-11-22, ships on the lanes, and working ships in the outer system)

Astra: "We need more ships running around in general." Asked where it felt empty, she said on the lanes and in the outer system. For the lanes she chose both streams and passers-by, and for the outer system all four trades: ice haulers, prospectors, gas-giant skimmers and survey ships.

**Why the lanes were empty.** Measured over 15 kawartha systems: about 173 ships fly in each system at any moment, and about 39 of them are out between worlds. But 89% of those had nobody else within a million km. That's because every route takes its own path between the worlds, so it's not a shortage of routes. Ordinary routes would take about 50 times the traffic to fill the gap, and every one would book berths and move markets.

**Lane streams** (`Gen.buildLanes`, `Sim.updateLanes`):
- **One lane per pair of worlds** with interplanetary trade. Each runs on that pair's busiest route, flown again by many sister ships ("Pilgrim Wain 17") spaced out along the same timetable.
- **Busy and quiet lanes.** The 5 busiest lanes in a system run thick, with a hull about every 2.5 million km each way. Every other lane runs thin, about every 20 million km. The thin lanes are the passers-by: real ships on a real timetable that you can follow to port, rather than random spawns.
- **Only the hulls near you are worked out.** The nearest 30 within 20 million km are shown, and only in the open middle of a crossing (8% to 92%). Near the ports, the real timetable is the traffic.
- **They change nothing else.** Lane hulls lie off the ports they serve, so they take no berth and join no queue. They register no deliveries, so no market moves.
- **Measured:** a ship out on a lane goes from about 1 neighbour within 20 million km to about 48. The share with nobody within a million km drops from 87% to 58%. Working out who is near costs about 1.75 ms, and it only reruns after 30 s of game time or 300,000 km of travel.

**The outer system's working ships** (`Gen.buildWorkers`, `sys.workers`). These fly a two-ended loop between a home port and a work site, the same shape as your own skimmers' work orders. The time at the site is spent working. About 14 per system, about 8 of them working beyond 3 AU.

| trade | works at | brings home | hull |
|---|---|---|---|
| gas skimmer | the top of a giant's air | hydrogen | tanker |
| ring cutter | a giant's ring | water and ore, by the ring's ice | waste-hauler hull |
| prospector | a belt or trojan field, among the rocks | ore, rare metals, water | shuttle |
| ice hauler | an icy moon past the frost line | water, to the port nearest the habitable zone | tanker |
| survey ship | the farthest world, if it's well past the frost line | nothing | shuttle |

- A belt field isn't a body, so a prospector's site follows `Rings.fieldCenter` (`Sim.bodyStateAt` reads `fieldRef`), and she parks inside the field.
- Workers lie off their home port and register nothing, the same as the lane hulls.

**Like any other ship.** Lane hulls and workers fly through `Sim.trafficAll`, so they show on the scope, can be hailed, robbed, rescued and lifted, and have captains. Neither is in `sys.traffic`, so nothing that counts berths, boards or deliveries sees them. A leak never strands one, because a tow would put her in a berth she doesn't take.

**What changes for an existing seed:** nothing that existed before. Routes, patrols, markets and every earlier draw are identical with lanes and workers on or off (tested). Workers draw from their own fork; lanes draw nothing.

**Saves.** Nothing is saved for them. A lane hull or worker you destroy comes back after a reload, which is a known gap.

**Tests and probe.** New test/streams.test.js (30), in the transfer group. tools/probe-lanes.js ran it in the game at Mirven:
- **On lane L0** (Harrow Deep to Lantern Terminal, 240 hulls), ships within 20 million km went from 1 to 12, 11 of them lane hulls, at 57 fps.
- **The prospector** Assay was out from Talus Field (L5) with 16 t ore and 8 t water. **The skimmer** Banded Lady was at the top of Mirven VI's air with 118 t hydrogen. **The ice hauler** Meltwater was bound for Mirven VI a with 300 t water.
- The run held 50 to 56 fps throughout.

### Added (2026-11-22, traders who turn pirate when a fortune passes)

Astra: "is there a way for a non-pirate NPC to turn pirate if a juicy enough target passes?" She chose armed traders and Syndicate runners, and that a trader who turns goes back to her lane afterwards, marked.

**Who can be tempted** (`ShipAI.temptation`):
- **Traders** only if they're armed, bent (probity under 0.4) and greedy (0.5 or more). An honest captain never turns, however rich the ship beside her. The lower her probity, the less it takes.
- **Syndicate runners** use the same rule now instead of a flat 12% a leg. Their probity only tempers their greed. Without the ship AI loaded, the old flat chance stands.

**What makes a prize juicy:** what it's worth against her own hold, on a log scale. Five times her stake starts to interest her, fifty times is all of it. Her stake never counts for less than 5,000 cr, and nothing under 20,000 cr is ever juicy. An armed prize tempts half as much. A trader never turns with the law watching; a runner rarely does.

**When it happens:** at most once per leg, rolled against the temptation on a seeded hash, so the same leg makes the same choice on every reload. It's only checked for ships near you, and only against a target within 600 km, which is usually you. About 4% of traffic are bent, greedy, armed traders. Beside an unarmed pilot carrying 100,000 cr they turn about 11% of legs on average, and with 300,000 cr about 19%.

**What she does:** the same as a runner. She fires first ("The Coldwater Barge breaks from her lane and opens fire on you - she wants your hold"), or knocks out an NPC's drive and strips her.

**Afterwards she's marked** (`Aggression.markCrime`, saved as `G.turncoats`):
- **The law treats her as a pirate.** Every lawful cutter that sees her runs her down.
- **Her record follows her route for 30 days.** The next cop who scans her papers chases her ("you are wanted for an assault on ..."). The record closes early if she's impounded or killed.
- **The dock talks.** Gossip in that system names her and who she turned on.

**Saves.** `turncoats` is a new field, so an older career loads with no records. No version bump.

**Tests and probe.** New test/turncoats.test.js (33), in the combat group. tools/probe-turncoats.js ran it in the real game at Mirven: the Coldwater Barge (probity 0.24, greed 0.56) turned on an unarmed pilot carrying 20 t of milfuel, and Warden 15 ran her down as a pirate.

### Changed (2026-11-22, outlaw numbers follow corruption; Syndicate and raiders named apart)

Astra: "Syndicate ships should have a different name list. Pirate or syndicate presence should go up with the corruption level in a system, yes, but they shouldn't be a majority of most civilized places."

**How many raiders** (`Gen.pirateRange`, from the system's corruption). Every system used to get 1 to 4 whatever its government (2.3 on average in clean systems, 2.9 in crooked ones).

| corruption | raiders | measured mean (160 kawartha systems) |
|---|---|---|
| clean (under 25) | 0 or 1 | 0.46 |
| bribeable (25 to 59) | 1 to 2, or 1 to 3 from 45 | 1.59 |
| bought (60 and over) | 1 to 4 | 1.62 |

The cap is still half the system's ports. In lawful space, raiders plus any Syndicate flagship may never outnumber the lawful guns (police, navy and capitals). A system with no law at all gets at most one. That cap is why bought systems sit near parity with their thinner police rather than at four. Pirate-band and Syndicate holds are exempt, because there the outlaws are the law.

**Raiders know their crew.** Each raider carries `band`. In a band's own space it's the band's id. Elsewhere it's `free:<port>`, so the freelancers working one port fly as one crew. Before this, every raider in a system read as one band, because they all had the faction `outlaw`. shipai.js `orgOf` now reads `band`, so slice 2's "each pirate band is its own flight" is real.

**Names:**
- **Syndicate flagships** have their own boardroom-style list ("The Chairman", "The Godmother", "The Majority Holder" ...) instead of the raiders' list.
- **Raiders** have 30 names instead of 10.
- **No two hulls in a system share a name.** This covers raiders, heavies, police and enforcers ("Vigil 12" walks on to "Vigil 13") and tugs. It costs no extra random draw.
- **What changes for an existing seed:** only the raiders' count, crew and names, and a Syndicate flagship's name. Patrols are generated, not saved, so a career simply meets the new ones.

### Added (2026-11-22, ship AI slice 3: what a civilian does when the guns come out)

The third slice of the ship AI (claude/ship-ai-profiles.md §7 item 3). Freighters and liners no longer answer a pirate with a fixed roll. Each one weighs five answers against her own situation and picks the best.

**The five answers** (`ShipAI.civilScores`, `choose`): comply, dump, flee, fight, surrender. Each is scored from a base for her role, scaled by what she can see:
- **Her situation** (`ShipAI.situation`): whether she's armed; her firepower, her mates' and the attacker's; whether she can outrun the attacker (more than 5% faster, and nobody outruns you); whether the law is near; her hull; whether she carries cargo.
- **Her role.** A trader leans to comply or dump when the demand comes, and to flee or fight once she's hit. A liner (passengers) never fights. Her first answer to a hit is to run or strike her colours.
- **Her mood.** Fear lifts comply, dump, flee and surrender. Anger lifts fight and halves surrender. When fear passes 0.6, she's armed and she can't outrun the attacker, she is cornered, and fight is lifted 1.6×.
- **The law nearby** lifts flee 1.6× and cuts comply to 0.7×: help is coming, so she runs for it rather than hand the hold over.
- **Stickiness.** Under fire, the answer she chose holds for 8 s unless another beats it by 25%, so she doesn't flicker between running and fighting. Ties break on a seeded roll, so the same ship answers the same way.

**Dumping is new** (`dumpCargo` in aggression.js). A freighter that dumps throws about a third of her hold out of the hatch as canisters (`Sim.dropCanister`, marked `dumpedBy`), writes the loss back to her manifest, shorts her delivery, and runs. The pirate stops to scoop what's floating rather than chasing ("X dumps medical supplies out of her hatch and runs - Y stops to scoop it"). Whatever the pirate hasn't scooped by the time she gives up is still in space for anyone else.

**A liner calls for help early.** When a pirate's demand reaches a passenger ship, she sends her distress call at once instead of waiting to be hit.

**Surrender reads the mood** (combat.js). A liner's base chance to strike is 0.9 (`surrenderBase`, now exported). `moodStrike` scales the surrender odds by (1 + 0.6 × fear), and by 0.6 if she's angry. A calm crew is unchanged. `beatenSurrender` takes the system and time so it can read the mood.

**Tests.** New test/civilians.test.js (41), in the combat group. aggression.test.js now accepts "dumped" as a freighter's answer to a demand. tools/probe-civilians.js runs it in the real game at Mirven: of four freighters robbed by The Scrag, three dumped and one complied, and every dumped canister was accounted for.

### Added (2026-11-22, ship AI slice 2: flights and moods)

The second slice of the ship AI (claude/ship-ai-profiles.md §4 and §7). Astra: loyalty "isn't in relation to the player, but to the 'flight leader' of the group", and "all syndicate ships will have loyal for one another."

**Flights** (`ShipAI.formFlights`). Ships of one organisation, lifted near you and within 300 km of each other (chained ship to ship), fly as one flight. The flights are re-formed every 2 s. The organisations:
- **Navy, per faction**, including the tenders that ride a capital.
- **Police, per faction.**
- **The Syndicate**, heavies and runners together.
- **Each pirate band.**
- **A freighter and the mercenaries hired to escort her run.**

Independent freighters and liners fly alone. The leader is chosen by rank (capital, navy, heavy, police, hired gun, pirate, tender, trader), then hull, then a seeded seniority, and a sitting leader keeps the job.

**What loyalty does:**
- **Covering a mate.** When a ship is hit, her armed wingmates within 2000 km turn on whoever hit her ("X breaks to cover Y").
- **The Syndicate answers its own.** Every Syndicate ship within 3000 km answers any Syndicate ship that is hit, whether or not they're in a flight.
- **When you're the attacker.** Hit a pirate, a Syndicate ship or an escorted freighter and her flight turns on you ("weapons hot"). A cutter's wingmate is left to the law's own answer, the crime and the warrant.
- **Following the leader.** Wingmates engage what the leader engages, and withdraw when she does. A band never piles onto a freighter its leader is only robbing; it closes in only once she refuses and fights, so no hold is stripped twice.
- **When the leader falls.** The senior captain takes the lead if her cohesion is 0.5 or more ("X takes the lead"). Otherwise the flight scatters ("the flight scatters") and doesn't regroup for two minutes. Taking the leader out is how a fight against a group is won.

**Moods** (`ShipAI.feel`, `moodOf`, `stance`). Each lifted ship carries fear and anger, from 0 to 1, on the spec. They are never saved.
- **Fear** has a half-life of 60 s × (1.5 − nerve). It is raised by:
  - a hit;
  - being robbed;
  - a wingmate killed;
  - losing the leader;
  - the odds, which hold it up from below: the firepower aimed at her against her own and her flight's.
- **Anger** has a half-life of 5 min to 1 h, set by heat: quick to anger is slow to forgive. It is raised by:
  - a hit;
  - being robbed;
  - a demand of hers refused;
  - a wingmate hit or killed.
- **Anger overrides fear in proportion to nerve.** A brave, hot-tempered captain hit three times is *angered*; a timid one is *scared*.
- **An angered pirate holds on** to half the hull a calm one breaks off at (0.2 instead of 0.4, through aggression.js `runAt`).
- **A wingmate whose fear beats her cohesion breaks formation and runs** ("X breaks formation and runs"). An angered one doesn't.
- **Anger at you** already outlives the meeting in captain memory: combat.js records "attacked" and "robbed".

**No numbers on screen.** As agreed, you learn a captain from her tells: the message line and what her ship does.

**Wired through aggression.js:** `onNpcHit`, `onNpcKill`, `onPlayerHit`, `onPlayerKill`, the robbery's strip and refusal, and a tick at the top of `Aggression.update`.

**Fixed along the way:**
- **"The The Scrag's drive is out."** A ship named "The …" got a second "The" in the drive-out message and its journal line (combat.js `TheName`).
- **A doubled label on awake ships.** Every awake ship near you is boxed on the glass with her name, class and range, and her sky tag also printed "name [class]" a few pixels off it. Awake ships now get the box's label only (main.js `holoNames`), as the nav and dock targets already did.

**Tests:** `test/flights.test.js` (new, 40 pass, in the combat group). It checks:
- who flies with whom;
- the leader by rank, and that she keeps the job;
- covering a mate, and the Syndicate answering across flights;
- your hit on a pirate versus your hit on a cutter;
- succession and scattering;
- the half-lives, and angered versus scared;
- the run hull;
- breaking formation;
- following the leader, and not piling onto a robbery;
- the same meeting giving the same result twice.

shipai, aggression, combat, band, rendezvous, hunters, captains, rescue and the rest of the combat group all still pass.

**Probe:** `tools/probe-flights.js`. In the real game it wakes two pirates of one band near you (staged), and you fire on one with Space held. The run showed:
- the flight forming, with The Tallow leading;
- The Scrag's drive going out, and her scared;
- The Tallow, angered, turning on you to cover her, and knocking out two of your panels.

**Not yet:**
- Your own company's ships don't form a flight with you.
- Your firepower is a rough estimate (one or two pirate guns' worth).
- The civilian choices fear will drive (dump cargo, comply, surrender, fight when cornered) are slice 3.

### Changed (2026-11-22, no panel overlaps another; the pilot's chair you can see)

Astra: "can you make a rule so no panel overlaps another, even if it means moving it up (if it's moved off the 'dashboard' then it's on a support, on a wall, etc." And: "We want the seat to be visible."

**The cockpit screens** (`Render.mfdLayout`, NO PANEL OVERLAPS ANOTHER):
- **Where the old check stopped.** The old check held the three dash screens apart only in the cabin every ship had. A fit's cabin moves them: spread wide, stood up high, or seated to one side. Fit C's instrument stack put them 6–9 px apart on every hull, against the 8 px at 1280 wide the suite asks for. Its housings were nearly touching.
- **How the rule places them.** Per cabin, the six screens go down in order: centre, left, right, overhead, then the two on the bulkhead. Each is kept 0.8° clear of every screen already placed, as seen from the seat's own eye. A screen that would come closer is lifted a centimetre at a time until it clears.
- **Supports.** Every dash screen now stands on a support (`drawMfdSupport`): a column from under its housing down to the dash surface beneath it (`dashYAt`, read off the fitted dash), on a foot plate 12 mm thick with two bolts. A lifted screen just has a longer column. The old code promised "a stalk down to the dash" in a comment but never drew one, so until now every screen floated. A wall or overhead screen just moves up its wall.
- **What moves today.** Only fit C's two outer screens, by 3–6 cm, into a small tiered stack. Fits A and B move nothing.
- **Cached per cockpit spec.** A ship with her own fitted spec gets her own answer. The Tanker bought in the probe needed no lift in fit C, for example.

**The boxes over the view** (`Render.claimOverlay`):
- **Claims.** Every box drawn over the view through main.js `panel` claims its rectangle: the captain's card, the transit readout, a hail.
- **The role panel keeps clear.** The role panel (weapons, cargo P/L, work, passengers) is never placed under a claimed box. Touching one costs a hundred times what touching an instrument does, and the spots just below and beside each box are tried. Captain Halloway's card had been covering it; it now sits clear of the card, top left.

**The pilot's chair** (`shipdeck.js` `pilotChair`):
- **Why it vanished.** The chair was darker than the walls behind it, so in a docked cabin it disappeared.
- **Shell and cushions.** The shell is now a lighter grey than any wall. The cushions are the palette's own colour: tan in a civil ship, navy blue, or the Syndicate's red.
- **Piping.** The back and headrest edges and the front of the cushion are piped with a dim strip of the palette's accent light, which the room's shading leaves lit.
- **One builder.** Your chair and the co-pilot's twin are built by the same function.

**Tests:** `test/panels.test.js` (new, 9 pass, in the view group). It checks:
- every hull's A, B and C, projected through the real cockpit camera from the fit's own seat, at 1920 and 1280 wide;
- that lifted screens are supported, fit A is never moved, and lifts stay small;
- that the role panel moves out from under a box, finds space with all four corners boxed, and goes back when the box goes.

Run with the rule switched off, the screen check fails on fit C, so it does catch the old overlap.

**Probes:**
- `tools/probe-abreast.js` now also refits to C and shoots the dash.
- `tools/probe-panel-sizes.js` lists every hull's in-game cockpit size and lifts.
- `tools/probe-copilot.js` reads where a hired pilot is on a two-abreast deck while you hold the helm (`Npc.lastScene`), then moves the clock on to her watch and looks across.
  - It found nothing broken. Off watch, she sleeps in her bunk: a ship with bunks keeps three watches, and the first probe landed on her rest period.
  - On watch, she walks up and sits in the co-pilot's chair beside you.
  - No code changed.

### Changed (2026-11-22, two abreast: the helm moves with the seat, and the co-pilot gets a chair)

Astra: "the player doesn't have to be centered in every ship; some of the bigger ones can have two seats, like an airplane." The cockpit view already sat you on the left of two in a large hull's fit B. Walking the deck didn't match: the helm chair was still in the middle.

- **Your chair is where the seat view puts you** (`shipdeck.js` TWO ABREAST). On an L/XL hull with cockpit fit B, the deck plan puts your chair at the cabin's seat. `Render.shipInterior` passes it in as `seatX`, and this is checked to match the camera exactly. Standing up puts you behind your own chair, and E there sits you back down in it.
- **The co-pilot's chair** is your chair's twin, mirrored across the centre line. There is no aisle between them: like a real flight deck, you get in and out from behind.
- **A hired pilot sits in it.** That was already how `npc.js` seated a co-pilot on the Wren and Bollard. When you get up, she takes the helm, as before.
- **Every other fit keeps the one centre seat.**
- **The cabin notes** (`Render.cabinOf`) now say the chair beside you is the co-pilot's mirror, not the old centre seat.
- **Tests:** a "two abreast" section in `test/shipdeck.test.js`, 69 pass. It checks:
  - on all 9 two-abreast hulls, the helm sits exactly where the seat view puts your eye;
  - the co-pilot's twin chair is on the other side;
  - you stand up behind your own seat, and E takes it;
  - the chairs stand clear of each other and out of the side consoles;
  - both are drawn;
  - every room on the bridge deck is still reachable;
  - every other fit keeps the centre seat.
- **A screenshot probe,** `tools/probe-abreast.js`. It buys a big hull in fit B, signs on a pilot, gets up with O, sits back down with E, and looks across.
- **Test runner:** `test/cargocost.test.js` added to the economy group in `tools/run-tests.js`. The runner refuses ungrouped files, so the full suite never started last time.

### Changed (2026-11-21, the HUD sits on the glass, not on your eye line)

Astra asked for the HUD to be centred on the cockpit glass, not the player's view. In ships where the seat is off to one side, the less vital information should move out to the side, and the crucial information should sit between the glass centre and the seat.

- **Where the instruments centre.** `Render.hudGeom` now centres them halfway between two points: the middle of the windscreen, and the point straight ahead of the seat. `main.js` projects that second point each frame and passes it in through `setHudRoom(aperture, seatX)`. The bank scale, heading tape, air data, attitude text and facing cue all use this centre (`hg.cx`).
- **Centre-seat cabins.** Both points are the same, so these look exactly as before.
- **Two-abreast cabins.** On the L/XL fit B, with the seat on the left of two, the instruments shift partway toward you.
- **The role panel.** Weapons, cargo P/L, work or passengers move to the far side of the glass (`rolePanelAt` now prefers that side).
- **Turning your head.** The layout is tied to the glass, so it stays put on the windscreen.
- **The raised seat in fit B on small and medium hulls.** Lowered from 9 cm to 5 cm (× room size). From 9 cm the console sank out of the bottom of the view.
- **The 'wide' console.** Now mounted 2 cm higher.
- **Canopy parameters.** The table for the exterior models (`claude/cockpit-cabin-params.md`) has been regenerated with these values.

### Added (2026-11-21, the trade panel prices your run; cabins vary by seat, console and canopy)

Astra: "I'd appreciate more variety with the location of the pilot's seat and the MFD panels, and some cockpit variants can have different HUD colors and characteristics, but all should be bright enough to provide good contrast. Use icons for trade. Trade HUD should show the cargo in your hull, how much you'll make or lose taking it to your destination in either bright green or bright red, fading through orange and yellow for deals which are less and less bad." And: "Changing the canopy shape is also permitted. It doesn't have to match the exterior, I can alter those models later as long as you give me the parameters."

- **What your cargo cost you is now kept** (`Economy.costBuy` / `costSell` / `costOf`). It was designed after the 2026-09-08 play report and never built.
  - Per commodity, it stores the credits paid and the tonnes they paid for. Buying adds to both; selling takes its share of both, so the average stands.
  - Tonnes that cost nothing (mined, scooped, salvaged) are simply the held tonnes the record doesn't cover.
  - A hold that shrinks some other way (jettisoned, taken) takes its share off when the record is read.
  - Contract freight is never in it. Waste is left out, because a port pays you to take it.
  - It's saved, goes with a ship onto the clamp and back, and is cleared when the hull is lost.
  - Additive: an older career's hold reads as having cost nothing.
- **The trade panel.** On a freighter's glass, each of your cargoes shows:
  - its mark (a new set of commodity icons: drums, sacks, logs, rock, gems, chips, gears, a helix and more; every commodity has one);
  - its tonnes;
  - what selling it at the port locked on NAV makes or loses against what it cost.
  - Colours: bright red for a real loss, through orange and yellow near break-even, to bright green (`Render.dealColour`). Every stop on that ramp is bright.
  - A NET line totals the run. Contract freight gets a plain line of its own, and a port that won't buy something says "no buyer".
- **Every HUD colour is bright.** Each is held to a relative luminance of 0.55 or better (`cargocost.test.js`). Coral and violet were under it (0.42, 0.50) and were lifted toward white.
- **A fit is a whole cabin** (`Render.cabinOf`):
  - **Fit A** is the cabin every ship had, untouched.
  - **Fit B** opens it up: wider glass, a slimmer brow, a wide low console. On a small or medium hull you sit higher. **On a large or very large hull you sit on the left of two, as on an airliner.** The glass and the room stay centred on the ship and your own screens move over in front of you.
  - **Fit C** closes it in: narrower glass, a heavier brow, an instrument stack stood up toward you, and a low seat further forward.
  - The canopy shape changes with the fit: the windscreen's width, the height of its top edge, the reach of the quarter-lights, and the lean. A refit rebuilds the cabin.
  - The yard card and the refit rows now lead with the cabin ("left seat of two · wide console · wider glass").
  - **The numbers for the exterior models** (every hull, every fit: glass reach, width and top-edge multipliers, wrap, brow, rake, seat, console) are in the project doc `claude/cockpit-cabin-params.md`, generated from `Render.cabinParams()`.
  - Not yet: on a two-abreast deck there's no co-pilot model in the seat beside you, and the walk-aboard helm spot is still the centre seat.
- **Fixed on the way:** the role panel read the market through a bare `Economy`. The render suite draws the cockpit without a market, and three of its checks failed. It now goes through `global.Economy`, and through `global.Missions` for the freight it counts.

### Changed (2026-11-21, cockpits: chosen at the yard, framed in metal, and a panel for what the ship is for)

Astra, after the first gallery: "I'm going to ask that you don't use flat rectangles in the player's visual field. Maybe what's missing is textures on the interior of the cockpit edges? I like the variation in HUD. The different cockpits should be available when purchasing a ship. Maybe you can make different interfaces for each ship type? Like a fighter shows missiles and guns selected, a freighter shows the current prices of your cargo at your selected destination, that sort of thing?" Her choices, asked: struts *and* textured edges; free choice at purchase, with a refit at shipyards later; the hull's role sets the panel, and fitted gear adds to it; all four role panels.

- **No flat shapes in the view.** The corner plates, the short posts and the fighter's combiner glass are gone.
  - **Every pane's edge is now a reveal.** That is the frame's inner face running from the glass back toward the pilot, so it foreshortens as you turn your head. It is lit from above (the sill catches the light, the header is in shadow), with a seal line at the glass and bolts along it. Bolts are sized by distance.
  - **A look sets the frame:** how deep it is, the bolt spacing, and whether the seal is lit in the hull's accent.
  - **Real window posts on the large and very large hulls.** They are prisms with a lit face and a shadowed one, standing from header to sill at the windscreen's top corners. A big ship's glass reads as three panes, and the HUD stays in the middle one.
  - **Small hulls get no posts.** A strut that ends in mid-air is what started this.
  - **Drawn after the glass,** because they stand in front of it. The first try put them under the glass's wash and they read as tinted plastic.
- **The cockpit is chosen when you buy her.** The yard card has COCKPIT A / B / C, with a line saying what each one is.
  - Free on purchase, and on a commission too: the order carries it to the slip and the hand-over.
  - **REFIT COCKPIT** on the fleet page, at a shipyard only, costs 2% of the hull price (150 cr minimum) (`Combat.refitCockpit`).
  - It is the ship's own (`ship.cockpitLook`). It goes with her onto the clamp and back (`Fleet.record`, take command) and into the save. Additive: an older career flies fit A.
- **A role panel on the glass** (`roleReadout` in main.js, `Render.drawRolePanel`): a title and up to five lines, in the look's colour and box style. It sits in whichever spot of this window is clear of this look's instruments: the four corners first, then just under or over the tape.
  - **Fighters and police:** guns by group, the armed missile and how many, heat (amber at 70%), the target and its range.
  - **Freighters and traders:** the hold against capacity, and each cargo priced at the port locked on NAV, with the total there against the total here.
    - There is no cost basis kept for cargo yet (planned in the 2026-09-08 play report as `cargoCost`, never built), so it cannot say profit against what you paid. It says what it knows instead.
  - **Tugs, miners and tenders:** ore and rare ore in the hold, how full the hold is, the arms' state, a tow, and the target.
  - **Liners and shuttles:** souls aboard, and each party's destination, fare and time left (amber under 6 h).
  - **Gear the role didn't lead with adds a line:** guns on a Mule, passengers on a fighter, a hold on a liner, arms on anything that has them.
  - Which hull is which: `Render.HULL_ROLE`.
  - The panel's spot is one of the readout boxes, so planet labels keep off it too.

### Changed (2026-11-21, every hull its own cockpit look — candidates)

Astra, looking at three cockpits: "some of these angled things are just floating in space on models where the glass is further out from the pilot's seat … can you re-design the interiors so that each one has a unique HUD layout and placement of cockpit visual details? Give me a few examples for each one and I'll tell you which is the best."

- **The floating corner pieces, fixed.** The corner gussets and centre mullion were drawn at fixed numbers from before the windscreen grew, always 1.2 m out. On hulls whose glass sits further out, or is bigger (every bubble canopy), they hung in the air in front of it. Everything on the windscreen is now built from that hull's own outline: its corners, its chamfers, and its own distance from the eye (`drawCanopyFurniture`).
- **A look per hull, three candidates each** (`Render.HULL_LOOKS`, A/B/C, 69 in all). A look has two halves:
  - **HUD:** a colour (jade, cyan, amber, ice, lime, coral, violet); where speed and altitude stand (wide, tucked in, low, high); the heading tape at the top or the foot; the bank arc above, hung below, or left off; and the boxes framed, corner-bracketed or bare.
  - **Windscreen furniture:** corner plates or braces sized per hull; a centre post, twin posts, or (fighters) a combiner glass on the glare shield; and an optional dim brow lamp in the hull's accent colour.
  - No candidate puts two instruments in one place.
- **The HUD now fits inside each window.** The glass is clipped to the windscreen, and on narrow-glass hulls (the tanker's is about half the screen wide) the speed and altitude boxes had always been drawn under the frame and cut in half. Nobody saw it until all 23 cockpits were lined up side by side. `Render.hudGeom` now places every instrument from one spot, brings the boxes in to fit the opening, and keeps the tape and bank arc between the window's top and sill and above the flight panel. `hudReadoutBoxes` reads the same geometry, so planet labels still keep off wherever the instruments went.
- **Defaults:** a ship with no fit recorded flies its hull's A look. The buyer chooses now (the entry above), so there is no single pick per hull. The pitch ladder keeps its old cyan and green outside a hull's look.
- `tools/probe-cockpit-looks.js` photographs all 69 candidates in the same spot over Mirven II, for the gallery.
- Not yet done, and asked for in the same conversation: two-seat cockpits for the bigger hulls, pilot in the left seat as on an airliner. That moves the eye, the console and the walk-aboard helm seat, so it is its own change.

### Fixed (2026-11-21, the bug hunt: where the new systems meet)

Astra: *"before I do that I want you to embark once more on the great bug
hunt"*. It covers everything since the last hunt (Nov 14–15), looking at
the seams between systems. Each system's own suite was green; all five
bugs were where two of them meet. Each was measured before it was fixed,
and `test/seams.test.js` pins it. Every check in that file was run with
its fix undone, to show it fails without the fix.

- **Com-sats × world digs: relay cover depended on when you last
  loaded.** Public relays are laid over every world with a port and then
  cached. A dig that opened while you were in the system came after
  that, so a dig on a bare world had no relays until you reloaded, and
  then six. This was true of all 130 such digs.
  - **Now:** the public network serves the worlds the system was
    generated with ports on. A dig's world, or a station you found on a
    bare world, is off the network until a sat goes up over it, and your
    own com-sat does exactly that.
  - **Your call to reverse:** relays could instead be pre-placed over
    every planned dig.
- **Mil-sats × late ports: a companion moon's station took platforms off
  older ports.** Platforms are capped per system and handed out by id,
  and `'b0cp1'` sorts before `'b12'`. In 3 of 53 guarded systems (Unis,
  Belora, Sytar) a pair moved to the moon. Ports the system was
  generated with now come first.
- **Mil-sats × late routes: platforms moved after a reload.** A
  platform sits on its port's busiest approach corridor, which is
  counted from the traffic and then cached. Routes added later (a dig's,
  a resort's, a companion moon's, your own station's) shifted it: one
  platform moved 6 km, and a dig opening mid-session would have moved
  others on the next reload. Corridors now count only the timetable the
  system was generated with. All 318 platforms are back where they were.
- **Saves × digs: docked at a dig's port, saved, reloaded, and you came
  back undocked at the foot of its shaft.** The start system is built
  at t = 0, before any dig is open. Your dig state (supplies that bring
  an opening forward) was also put back only after the system had been
  entered. Both now come back before the dock, the same way the
  stations you found always have.
- **Slipspace × binaries: a distant companion star dragged the jump
  ring, and every wake, out with her.** The ring is the farthest orbit
  round the root, and a companion orbits the root. It moved in all 76
  systems with one: Mirven's went from 2.2 AU to 9.4, Dratara's from
  27 AU to 3,450, and wakes were scattered out there with it. Only
  worlds count now.
- **Checked and fine:**
  - the barycentre stays off the F3 list and can't be locked;
  - resorts and companion ports join the relay network as often as any
    other port;
  - the four EVA and crew issues from the last hunt were already fixed
    in an earlier release.
- **Tools:**
  - `hunt-islands.js`, `hunt-digrelays.js`, `hunt-digdock.js` and
    `probe-barycentre.js`;
  - `test/seams.test.js` (6 checks, in the economy group).

### Added (2026-11-20, worlds worth visiting, slice 3: the resort pad)

The plan: "The most appealing worlds get a guaranteed second ground port,
off their own forked substream so no existing pad moves."

- **Every postcard world a ship can land on now has at least two ground
  ports.** Where it had fewer, it gets an open-air resort, the last port
  built in the system.
  - **Where:** only postcard worlds (appeal 0.7 and up), never a buried
    bay. A resort with no dry ground to stand on is built as a sea
    platform, like any other pad.
  - **Names:** a stock of its own ("Larkspur Resort", "Halcyon Retreat",
    "Long Light Terraces"), not the working pads' "Groundside" and "Low".
  - **The rest:** its own id (`<world>rs`), market, dressing and routes.
    Its ferries carry people, and the holiday hops on the passage board
    can now land there.
  - **Faction:** the world's own where it has ports, else the system's.
- **Measured** (`tools/diag-resorts.js`, 120 claimed systems): 13 resorts
  in 13 systems. 7 are on the new companion moons, 4 stand on the sea.
  Home has one: Larkspur Resort, on Mirven II.
- **Nothing that existed moves.** Every body (4,748 in 120 systems) and
  every older route is identical, field by field, with and without
  resorts (`opts.noResorts`).
- **One shared path for late ports.** The companion moons' ports and the
  resorts are settled by the same code, `settleLatePorts`: the walk
  inland, the sea platform, then market, dressing and routes, each from
  a stream named for the feature and the port. The companion's seed
  strings are unchanged.
- **Tests:**
  - `test/resorts.test.js`: 15 checks, in the economy group.
  - `seaplatform.test.js`'s count of sea platforms moves from 223 to 233.
    A check now accounts for all 19 added since 214: 9 on companion
    moons, 10 resorts.
  - `multiples.test.js` and `tools/diag-multiples.js` now leave resorts'
    routes out of "what existed", as they already did the companion
    moon's. A resort's timetable is built after the companion, so it may
    call at her ports. Every older route is still compared.
  - `twilight.test.js` builds both sides of its old-versus-new comparison
    without resorts. Resorts follow a world's pad count, and the twilight
    pass is what changes that count. Its check "new ports only take ids
    after the old ones" had been passing by default since the first named
    id (`b0a`) arrived: `+'0a'` is NaN, and `Math.max(-1, NaN)` is NaN.
    It counts only plain `b<n>` ids now, and it still passes.
- **Saves:** additive. A career loads into the same systems, with the
  resorts added.

### Fixed (2026-11-20, other people's ships counted as yours)

- **Found by `stations.test.js` once resorts arrived.** `addPortRoutes`
  was written for the stations you found, and stamped every route it
  made `playerPort`. Three later kinds of port reuse it: the world's own
  digs (2026-11-19), the companion moons' ports and the resorts
  (2026-11-20). Their NPC ships were read as your own lines, so:
  - never raided (`attachRaids`);
  - never held at a lonely pad (`Sim.arrivalHold`);
  - never an aggression target (`aggression.js`).
- **Now:** a route is `playerPort` only if its port is a station you
  founded. A seized station keeps the flag, as before. Every other late
  route is marked `latePort` and raided at the system's own odds. The
  per-route half of `attachRaids` is now `raidRoute`, with no RNG draws,
  so nothing generated earlier moves.
- **Measured** over 150 systems: 168 late routes, none flagged as yours,
  and 794 of their deliveries raidable.
- **Pinned in `resorts.test.js`:** "a resort's ships are not counted as
  yours", and "they are raided at the system's odds, like everyone
  else's".

### Added (2026-11-20, worlds worth visiting, slice 2: the passage board follows appeal)

The second slice of `claude/after-mining-roadmap.md` item 8. The agreed
shape is in `claude/worlds-people-and-infrastructure.md`: "more short
station ↔ ground passages (low pay per soul, quick, repeatable); more
inbound passengers from the rest of the system and from other stars."

- **Hops.** On a world rated pleasant or better, the sky and the ground
  trade tourists.
  - Any port there can post a passage to a port on the other side
    (station to pad, or pad to station). A pleasant world posts up to one
    a window, a postcard up to two.
  - Each is 3–8 day-trippers, tour parties or wedding parties, due within
    a day.
  - It pays less per head than an ordinary local passage: a median of 258
    cr against 552. Small, quick and repeatable, which is the shuttle's
    trade.
- **Inbound.** Ports on every other world in the system book holidaymakers
  for the system's best world (pleasant or better). One chance a window,
  as likely as the world is appealing (60% of its score). The pay is the
  local passage rate, nudged up by appeal.
- **Going home.** An appealing world's ports post passages for tourists
  heading back to a neighbouring star, at the interstellar rate. This is
  the inbound trade from other stars, seen from the end that knows it. A
  port can't judge a world in a system nobody has generated, so the
  appealing end posts the work.
- **The board says why.** For example: "People come for 2 big moons and
  the aurorae." It names only the draws (clear skies, a giant overhead,
  big moons, aurorae, a sun that never sets), never the drawbacks.
  Leaving: "They came for <world>, and the holiday is over."
- **Measured** over 50 claimed systems, 4 windows each (3,132 boards):
  1,187 holiday offers (321 hops, 696 inbound, 170 going home). A postcard
  world's board averages 2.40 passage offers against a harsh world's 1.22.
- **Nothing that was on a board moves.** The holiday trade has its own
  stream (`'tourism|'`) and is appended after every other kind of work,
  with its own ids (`tr|…`). A test builds 448 boards both with and
  without the holiday trade, and every older offer is identical, field by
  field, text included.
- **Fixed before it shipped:** "5 aboard, a honeymoon couple". A couple
  is two people now, whatever the roll said.
- **The F7 board scrolls (fixed: it used to drop rows silently).**
  - A board longer than the panel stopped drawing at the foot without a
    word. The kinds of work added last (digs, relays, mail, platforms,
    and now holidays) were the first to vanish, which reads as "there
    is none".
  - Hold left Alt for the cursor and roll the wheel over the board, the
    same as the notes log.
  - A scrollbar shows only when something is out of view, with "▲ N more"
    and "▼ N more · wheel to scroll" at whichever end is hiding rows.
  - The wheel stops once the last row is showing, and the board starts
    from the top again at each new port.
  - Seen working in `tools/probe-tourism.js`: an open DETAILS row pushes
    the holiday offer off the foot, the count says so, and real wheel
    events bring it back into view.
- **Tests:** `test/tourism.test.js`, 19 checks, in the economy group.
  `tools/diag-boardfit.js` counts how many boards outgrow the panel.
- **Saves:** unaffected. Boards are generated per port and window, and
  nothing new is stored.

### Added (2026-11-20, more than one sun, and a giant over a living moon)

Astra: *"yeah, add both changes please"*. That means binary stars (stage 3
of `claude/stars-and-systems-plan.md`), and a postcard world: a habitable
moon with a giant filling its sky.

**Nothing that already existed moves.** Every planet, moon, port, route,
patrol, market and ring is identical with and without the new stars, so
saves carry on. This was checked body by body, 0 moved of 1,529, by
`tools/diag-multiples.js` and `test/multiples.test.js`.

- **Measured before building** (`tools/diag-stars3.js`, 200 systems):
  - A close pair (orbiting at least once a week) fits inside the innermost
    planet in 128 of them.
  - A companion far enough out to disturb no planet sits a few tens of AU
    out at the median.
  - No warm chain of planets has a gap wide enough for a Jupiter, so a
    giant cannot be added among the existing planets without moving them.
- **Close pairs.** In some systems the star you knew is now two stars,
  orbiting each other.
  - Their masses and light add up exactly to the old star's, so every
    planet orbits them as it orbited the star, under the same light. The
    orbits, habitable zone, world types and ports are all unchanged.
  - The system's root is now their shared centre of mass (still `b0`). The
    stars are `b0a` and `b0b`, opposite each other through it.
  - A pair only forms where it fits: it orbits no faster than once a week,
    and every planet stays outside 1.15× the critical radius for stable
    orbits round two stars (Holman & Wiegert 1999). Pair separations are
    0.08–0.37 AU (p10–p90).
- **Distant companions.** A second sun circles the whole system, mostly
  tens to hundreds of AU out (median 72 AU).
  - No planet is left outside the zone the companion lets stay stable.
  - Where the real separation would have disturbed a planet, the companion
    is pushed outward instead. So the closest companions are
    under-counted; that is what keeping every world in place costs.
  - Her light is kept out of the planets' insolation on purpose, because
    at that distance it is a few thousandths of Earth's sunlight.
- **Triples.** A close pair plus a distant third star.
- **How many.** In 120 claimed systems: 69 single, 34 with a distant
  companion, 4 close pairs, and 13 triples (43% with more than one sun).
- **On screen.**
  - Each star is drawn as a star, so from the innermost world of Linira
    you see Linira A and Linira B side by side
    (`probe-multiples/1-two-suns.png`).
  - The F2 BODIES list names every star, and the SYSTEM panel reads
    "Linira (F+M+M)".
  - The galaxy chart still shows one star per system; companions on the
    chart are not done yet.
- **What the ship feels matches the orbits the worlds follow.**
  - Every planet of a close pair orbits a single point mass at the
    barycentre. So once a ship is past 1.5–2.5 pair separations, the two
    stars pull on her as one point there. Without this, a ship parked
    round a circumbinary world would drift off it by hundreds of km a
    day. Beside a world the match is exact (1e-15).
  - A distant companion is ignored until a ship is 40–60% of the way out
    to her. Out by her, the ship also falls toward the main system as her
    own worlds do.
  - Single-star systems feel exactly what they did, to the last bit.
- **A giant in a warm zone, and the moon under it.**
  - A companion with room for it may have a gas giant that migrated into
    her own warm zone. About 1 system in 10 gets one: 7 of 120 in the
    tests, 20 of 212 measured.
  - The giant has one moon worth living on: terran or ocean, Earth-heavy,
    with real air, and the giant 8–21° across its sky.
  - Most of those giants are ringed, and appeal reads every such moon as a
    postcard, 0.81–0.94 ("a ringed giant overhead").
  - Each such moon gets a station and a pad, built the way a dig's port is,
    with their own markets, dressing and routes, plus ferries that carry
    people.
  - Rings for the companion's giant come from the same per-giant stream as
    every other ring.
- **Tuned after the first probe.**
  - At first 41 of 150 systems had a postcard moon, which is no longer a
    postcard, so the chance is now 0.35.
  - The moon first sat 14–32 giant radii out, which showed a 4° coin, so
    it is now 6–14 radii.
  - Round small companions, the moon could be dragged inside two giant
    radii, inside the Roche limit, with the giant 50° across. Those are now
    not generated.
- **Fixed on the way:** a moon's world card always said "ports 0". It now
  counts the moon's own docks.
- **Found by the full suite (124 of 127 green on the first run):**
  - Every habitable world should have at least two ports, but five
    companion moons had one. Their giant's pull left no room for a
    station, so they now get a second station or a second pad.
  - One companion moon's pad stood in a sea. Those pads are made after the
    usual walk inland, so they now take that walk themselves (and skip it
    under `noInland`, as every other pad does). Where no dry ground exists,
    they become sea platforms, the same as every other pad.
    `seaplatform.test.js` pins the galaxy's count of platforms, which went
    from 214 to 223. A new check shows the 9 extra are all on companion
    moons.
  - `mining.test.js` "every star has a corona to skim" looked only at the
    root, which in a close pair is now the empty point between the two
    stars. It now checks every sun, and each has its own corona; the game
    already skimmed any of them.
- **Tests:**
  - `test/multiples.test.js`: 17 checks.
  - `stars.test.js`: its single-star section now builds with
    `noMultiples`, because it is the single-star guarantee.
  - `physics.test.js`: the orbit-crossing check now compares neighbours
    round the same parent, and the far-field 1/r² check runs on a lone
    star. Kawartha's companion sits exactly where it sampled.
  - `tools/probe-multiples.js` shows a pair from its innermost world, its
    F2 map, the giant from its moon, and the moon's card.

### Added (2026-11-20, worlds worth visiting, slice 1: appeal, and ferries that carry people)

Astra, 2026-10-17: *"HZ worlds, especially worlds which have nice weather
and a good view have more passenger destinations ... This also gives the
shuttle a purpose."* The next stage after mining (`claude/after-mining-roadmap.md`
item 8). New file `src/appeal.js`.

- **Every world with air gets an appeal score from 0 to 1**, banded as
  postcard, pleasant, livable or harsh. It is built from three parts:
  - **Earthlike.** Gravity, air and warmth near home, and how much of the
    world is livable: all of it, a tipped world's equator, or a locked
    world's twilight ring. One hostile number sinks the lot.
  - **Climate.** The world's own cloud cover, the same figure the
    renderer draws. A little cloud is free; constant cover costs.
  - **View.**
    - a giant overhead, worth more if it is ringed;
    - big moons, close enough to see as discs;
    - aurorae, where a magnetic field sits over real air;
    - the twilight ring's sun that never sets.
  - The view lifts a livable world but cannot rescue a lethal one.
  - It is worked out from what the generator already wrote, so it moves
    no seed and is never saved.
- **Measured over 160 claimed systems** (`tools/diag-appeal2.js`). Of the
  1,028 worlds with air, 430 are habitable:

  | | Postcard | Pleasant | Livable | Harsh |
  |---|---|---|---|---|
  | Habitable worlds | 24 | 146 | 178 | 82 |

  - **Best:** Mirven II, where you start, at 0.85 (two big moons and
    aurorae).
  - **Worst:** twilight-ring worlds with thin air and the wrong sun,
    around 0.02.
- **Ferries carry people.** A shuttle running between two docks over the
  same world now carries passengers in proportion to that world's appeal:
  none below 0.3, and up to 24 on a postcard world.
  - Across 60 systems, 7,056 of 10,344 ferries carry people. At Mirven it
    is 96 of 156, for example the *Lodestar Drover* with 28 aboard.
  - The passengers are what everything that already reads passenger counts
    sees:
    - a ferry with people aboard is a passenger ship to the ship AI;
    - the crew you meet aboard are counted from them;
    - a rescue of one is about the people.
  - Generated in its own seeded stream after everything else.
    `tools/fingerprint.cjs` gives identical hashes for five seeds with and
    without it, so no route, time or hold moved.
- **On the world's card (F3, NAV → WORLD), the first note** now reads,
  e.g., "For visitors: Postcard - 2 big moons, aurorae."
- **Found while measuring:**
  - None of the 10 moons that orbit gas giants is livable. Giants form
    past the frost line, so every one of those moons is cold, with thin
    air and light gravity. The postcard Astra described (a habitable moon
    under a giant) does not occur in this galaxy yet.
  - There are no binary stars either: 120 of 120 claimed systems have a
    single star.
- **Tests:** `test/appeal.test.js` (21 checks), `tools/probe-appeal.js`.

### Added (2026-11-20, hold into a hardpoint)

Astra: *"adding another gun hardpoint in exchange for cargo space?"* I asked
four questions and she chose: a flat cost by hull size, up to two per hull,
both a registered and a concealed kind, and shuttles allowed too.

- **What a conversion is.** It is one more hardpoint, added after the
  hull's own, so nothing already fitted moves. In exchange it takes a fixed
  bite of the hold.
  - **Hold cost by hull size:** S 6 t, M 10 t, L 16 t, XL 24 t.
  - **Price by hull size:** S 9,000 cr, M 15,000 cr, L 26,000 cr,
    XL 45,000 cr.
  - **Why flat and not a share of the hold:** a share would charge a
    Leviathan about 100 t for one gun. Flat, a big freighter barely
    notices, and an interceptor gives up half of very little.
  - **Buying the gun:** you buy and fit it from BUY like any other gun,
    against the same reactor and mass budget. That budget is usually the
    real limit, so two conversions is a ceiling, not a recommendation.
- **Registered.** Cut at a shipyard and on her papers. Pirates sizing her
  up see the gun.
- **Concealed.** Cut at any port where corruption is 60 or more, the
  grey shelf's own threshold.
  - It costs 1.6 times the price and takes three quarters of the hold
    (5 t on a Talon), because nobody builds the certified magazine
    bulkhead.
  - **Behind its panel:** nothing is drawn on the hull, not even the
    empty mount plate, and pirates and runners judging whether you're
    armed don't count it.
  - **The first shot opens the panel for good.** If a cutter or warship is
    in sight when it fires, that's a charge (2,500 cr bounty) with its
    faction. The Syndicate's own heavies don't care.
- **Shuttles.** The Wren and the heavy shuttle, which have no hardpoints,
  can take one.
- **Cutting one back out** costs a quarter of its price, and the hold
  comes back exactly. The mount must be empty first. Any conversions
  above it move down a slot, taking their guns and fire groups with
  them.
- **It belongs to the frame.** A conversion is tied to the hull it was
  cut into. A different hull has none, and a new hull bought at the yard
  starts with none. It goes with her into the fleet, back out of it, and
  into the save. Older saves load with no conversions.
- **Where to find it:** at the bottom of the yard's FITTING tab.
  - The registered row is always shown, with the reason when a port
    can't do it.
  - The concealed row only appears where one can be had.
  - Converted slots are labelled CONVERTED, CONCEALED, or CONCEALED, SEEN.
- **Tests:** `test/conversions.test.js` (40 checks).
  `tools/probe-conversions.js` shows the FITTING tab at Halden Yard with
  one of each cut and a gun in both.

### Added (2026-11-20, ship AI slice 1: six roles and a captain's character)

Astra asked for AI ship behaviours and for "scared", "loyal", "angered",
"trader", "passenger", "police", "syndicate", "pirate" and "navy"
profiles, modified by how corrupt the system is and how corrupt each
captain is. The design is in the project doc `claude/ship-ai-profiles.md`.
Nothing behaves differently yet. This slice gives every captain the
numbers that later decisions will read. New file `src/shipai.js`.

- **Six roles, read off the ship** (`ShipAI.roleOf`):
  - trader;
  - passenger (a liner, i.e. a ship with souls aboard; a feeder shuttle
    carries freight, so it counts as a trader);
  - police;
  - navy;
  - syndicate (the heavies and anything flying the outlaw flag that
    isn't a raider; a heavy used to read as a cop);
  - pirate.
  - Across the first 140 claimed systems of the test galaxy there are
    32,728 traders, 1,563 passenger ships, 909 Syndicate, 433 pirates,
    385 police and 43 navy.
- **Six dials per captain** (`ShipAI.dials`), each from 0 to 1:
  - nerve, greed, probity, discipline, heat and cohesion;
  - built from the role and from the temper and values captains already
    had, plus a seeded wobble;
  - worked out on demand, never saved, and no generator stream moved.
- **Probity is the captain's own corruption**, and what it means depends
  on the role: an honest or bent cop, a pirate with a code or one who
  shoots the witnesses, a Syndicate captain who keeps the mob's word or
  skims.
  - The system's corruption pulls probity but does not set it. Bribes and
    holdings count, since it reads `Combat.systemCorruption`.
  - Measured on police: almost none bent at corruption 15, 37% bent at
    80. The design's first figure (a pull of 0.5) bent only 10% in a
    bought system, so the police pull is 1.0.
  - Astra on the Navy: *"A few."* 4 of 43 navy captains are bent.
  - A pirate's code doesn't move with the system, because pirates answer
    to no institution.
- **Cohesion** is how firmly a captain holds to her flight leader. Astra:
  loyalty *"isn't in relation to the player, but to the 'flight leader'
  of the group"*. Syndicate and navy captains hold together; pirates and
  traders less so. Flights themselves are slice 2.
- **The dials are not shown anywhere.** Astra agreed you learn a captain
  from her tells, the dock talk and what she does.
- **Tests:** `test/shipai.test.js` (27 checks).

### Changed (2026-11-20, Astra's notes on slices 3 and 4)

- **Rumours go over the wire between linked ports.** Astra: *"yes."*
  Two ports in the same system that both reach the relay network share
  what they hear within 10 minutes (`WIRE_S`), instead of waiting for a
  ship to carry it. A port cut off by a dark relay (an island) does not
  get it. In the test system all 10 linked ports heard inside 10
  minutes, and the island only heard 38.8 hours later.
- **The relay network has a hop limit, so hubs matter.** Astra: *"hop
  limit to enforce the development of hub systems."*
  - A signal can make 3 relay hops (`SAT_HOPS`) from a hub before it
    stops. Each com-sat of yours that is live is a hub, and the count
    starts again there.
  - One hub reaches 25 of the 54 stars in the test galaxy; a second hub
    raises that to 27. Where you put a hub now decides what your news
    can reach.
- **The canopy glass is lighter.** Astra: *"glass tint is too dark."*
  The tint is cut by more than half (alpha 0.055 → 0.025), and so is the
  dark vignette at the edges (0.42 → 0.16). A ship 80 m off the nose now
  reads clearly through it.
- **Cockpit mouselook is quicker and smoother.** Astra: *"cockpit
  mouselook is sluggish."*
  - The look rate is up to 0.0062 radians a pixel.
  - Right-Alt free look in the cockpit now captures the pointer and
    reads raw mouse movement. It used to read the cursor's position,
    which stalls at the screen's edge and lags a frame.
  - Frame rate was measured first and was not the cause: 55 fps in open
    space at Mirven.
- **Platform marks sit to the left of their station's name on the F2
  map.** Astra: *"put icons to the left of the station's name."* Each
  mark steps 11 px further out, so a pair reads as a pair.
- **The start's "Docked at Threshold Dock" line is cleared once you are
  not docked there.** The probe that showed it: launch, and the message
  is gone.
- **Tests:**
  - comsats, 52 checks (the hop limit added);
  - islands, 25 checks (the wire added);
  - milsats, 29 checks (corridors added).
  - `tools/probe-fixes-1120.js` shows the glass, the F2 marks at Noolm,
    and the message clearing. The probe now opens F2 with a key press,
    because setting the panel directly skipped the map's camera.

### Added (2026-11-20, com-sats slice 4: armed defence platforms)

Astra, 2026-11-19: *"a mil-sat is just an armed defense platform. We'll
have those in high-authority systems and along the border with no-man's
land."* New file `src/milsats.js`.

- **Where they are.** I measured 120 claimed systems before setting any
  threshold (`tools/diag-milsats.js`).
  - **High authority:** crime score 20 or less with development 0.6 or
    more, or a navy garrison in the system. That is 24 of 120.
  - **The border:** an empire's star with an unclaimed star within 8 ly.
    That is 9 of 120; the frontier is thin.
  - None in pirate or Syndicate holds. About a quarter of claimed systems
    have platforms; Mirven, where you start, does not (Noolm does).
- **What they are.** A pair to each civilian orbital port, at most six
  to a system, owned by the system's power. Astra, 2026-11-20: *"a pair
  of them that guard the most probable insertion trajectories toward
  that station."*
  - The corridors are measured, not guessed. Every scheduled arrival's
    last approach (the final 4% of the leg) is taken in the station's
    own orbital frame, the directions are clustered, and the two
    busiest bundles each get a platform 45 km out along them. Where all
    traffic comes in one way, the pair flank that corridor 10 km to
    either side.
  - On the rails: the offset is held in the station's frame, so the
    pair ride its orbit and keep facing the way ships come in.
  - At Noolm, all three guarded ports turned out to have two corridors.
    In the test system, 6 of 9 later arrivals pass within reach of a
    platform; the two in a pair sit 88 km apart.
- **What they shoot.** 30 km reach, 12 damage a shot, one shot every
  1.5 s.
  - You, only when the owner wants you (the same test its police use) or
    when you have fired on it in the last half hour.
  - Pirates and Syndicate raiders in reach, always. A pirate it kills is
    not your kill.
  - It never fires on an innocent: your standing decides whether it is
    protection or a threat.
- **Their RTG goes dark like a relay's.** Each platform has its own
  service cycle. A late tender leaves it dark and unarmed.
  - The fuel contract is military work: posted only at the owner's ports
    and its navy's, delivered to the guarded port, at double a relay's pay
    (24,640 cr).
  - Cutting that supply takes a platform down without a fight.
- **You can shoot one.** A shot down your nose that meets a platform
  first lands on it. The first hit is assault (300 cr bounty) and it
  answers; destroying it is a navy-class kill (12,000 cr, standing −30).
  Its hull and death are saved (`G.milsats`).
- **Seen:**
  - In space: a dark armoured drum with radiators and a turret, the
    owner's colour on its band.
  - Far off and on the map: a new icon, solid when armed, slashed when
    dark, dashed when destroyed, red when it is after you. It is in the
    F3 legend.
- **Not built yet:** hacking or bribing one, and salvage. The RTG core in
  a dead platform is the dangerous prize.
- **Tests:** `test/milsats.test.js` (27 checks). `tools/probe-milsats.js`
  shows one in Noolm firing on a wanted pilot and holed.

### Added (2026-11-20, weapon hits leave hot metal and wounds)

Astra: *"heated metal from weapon fire striking a station or ship, as well
as damage decals which show a glowing, arcing interior, or which show gas
venting from the ship's interior."* New file `src/scars.js`.

- **Hot metal.** Every hit that gets through a shield leaves a spot on the
  hull, in the hull's own frame, that glows and cools over about twenty
  seconds of game time, from white through yellow and orange to dull red.
  - Hits close together heat the same spot, so a beam held on one place
    cooks it white, while a spray of pulses leaves freckles.
- **Wounds.** Enough damage in one spot (14% of the hull) opens it: a
  dark ragged hole with a hot lip. Which kind of hole it is comes from the
  ship and the spot, so the same fight leaves the same wounds.
  - **Arcing:** the interior glows and the wiring shorts across the hole
    in blue-white fits. It is fierce at first and settles to every so
    often.
  - **Venting:** gas streams out along the hull's normal, thinning as the
    compartment empties over about two and a half minutes, then it is a
    dark hole.
  - The worst damage stays. When a hull is full the oldest cold marks go
    first, at most ten on one hull.
- **On ships, yours included:** each scar is placed on the actual hull
  model by a ray against its mesh, and one on the far side is not drawn.
  A hull repaired to full has no scars.
- **On stations:** a shot down your nose that meets a station now stops on
  its plating. It is tested against the station's real mesh, so a shot
  through a wheel's spokes still goes on through.
  - The plating heats and in the end opens, and the station logs you: an
    assault bounty, once per ten minutes of fire. Your own stations scar
    but do not book you.
  - Station crews patch a cold scar after two days.
- **The scars are not saved.** A reload is a fresh look at a patched hull.
- **Tests:** `test/scars.test.js` (27 checks). `tools/probe-scars.js`
  shows your hull holed, arcing and venting; a trader worked over; and a
  station holed.

### Added (2026-11-20, com-sats slice 3: islands felt everywhere)

Astra, 2026-11-19: knocking a relay out *"turns a station into an island
which gets its news by courier."* Until now an island was only a word on
the COMMS page. Now it changes what you can see and what work there is.

- **An island's prices are courier-old** (`Comsats.seenAt`).
  - Seen from anywhere else, an island's market is as the last ship out
    of it left it, worked out in closed form from the timetable (the same
    berthing network rumours ride). Before it went dark its figures were
    on the wire, so they are never older than the day it went dark.
  - Docked at an island, it is the other way round: everyone else is as
    the last ship in brought them, and the relay chain to other stars
    does not reach the desk (those reports come by freighter).
  - Your own visit counts as a courier: dock at an island and you carry
    its prices out as they stood when you left (`G.portSeen`, not saved).
  - Lanes between worlds are slow, so this bites. Measured over 478
    island-moments in 60 systems: median 4 days old, and one in ten as old
    as the dark itself.
- **Where it shows:**
  - **Trade analyser:** the head line turns amber and reads "ISLAND ·
    8.0 days old, by courier"; the graph's end is marked "courier" and the
    axis counts back from now; a locked island's bid reads "(... by
    courier)" in the break-even.
  - **Survey array (TRADE page):** islands are read at their courier age
    too, so its shortages and best run are what you could actually know.
  - **Orbit map BODIES list:** a slashed relay, amber, at the end of an
    island's row. COMMS already said ISLAND.
- **An island's mail** (missions.js `mailOffers`). While a world's relays
  are dark (an RTG lapse; a geometry island is over in an hour and posts
  nothing):
  - each of its ports posts its own sacks (1 to 3 t) to the main port
    still on the wire;
  - every other desk holds the mail for it, one job per island posted at
    them all;
  - "Mail sacks" are freight no market lists, like the courier parcel;
  - the pay grows with the dark: 700 cr plus 90 a day, capped at 6,500,
    scaled by tonnage, never under a leg's floor. Ten days in, about
    1,800 cr for 2 t.
- **Not changed, decided by me (say if you want it otherwise): word of
  you.** Rumours already travel only on ships (rumours.js: "no
  faster-than-ship comms"), so an island hears of you exactly as late as
  it always did. Gossip is people in bars, not relay traffic, so relays
  do not speed it up anywhere. The alternative is for linked ports to
  share what they hear over the wire, which would make your reputation
  travel much faster everywhere except islands.
- **Tests:** `test/islands.test.js` (23 checks: the timetable sums, an
  island's age both ways, your visit, fuelled again, the analyser and the
  survey array, the mail). `tools/probe-islands.js` shows it in the game;
  `tools/diag-islands.js` measures the ages.

### Added (2026-11-20, drawn icons for what things are; relays in space and on the map; the RELAY panel)

Astra: relays and sats should be *"both models in space as well as on the
map."* She asked for *"another panel selectable for the MFDs which tells
you which sat you're connected to, and shows which links are up"*, and
for *"small icons which indicate this information without using ascii
characters."* Also: *"icons for the comms menu and the nav menu which
shows what is a spaceport and what is a ship and what is a pirate ship
and what is a planetary starport or a mining facility, or navy, or
syndicate."*

- **New code: `src/icons.js`.** It is one set of small drawn shapes, in
  the row's own colour, so the colour still says whose a thing is and the
  shape says what it is.
  - **Ports, by who runs it first, then by what it does:**
    - a shield for navy;
    - a hexagon with a cross for the Syndicate;
    - a pennant for yours;
    - a ring for a station;
    - a ring with spokes for a highport;
    - a crane for a yard;
    - a drop for a refinery;
    - a pick for mining;
    - a leaf for agri;
    - a dome on its ground line for a planetary starport.
    - Mining and agri ports on the ground stand on a ground line.
  - **Ships, as chevrons:**
    - filled for a trader;
    - with barbs for a pirate;
    - hollow with a bar for a warship;
    - with a beacon for police;
    - with a cross for a Syndicate runner.
  - Stars, planets and moons are drawn too.
- **Where the icons are used:**
  - the COMMS channel list;
  - the F3 nav list, which now has a key underneath;
  - the CONTACTS page on the MFDs, which used to type `> * O o #`;
  - the orbit map's BODIES list, which used to type the same marks.
  - Measured over 30 stars: 275 ports in 11 kinds, and 4,374 hulls across
    traders, runners, police, pirates and warships.
- **Two shapes redrawn after looking at them:** the mining pick read as a
  letter T at list size, so it is tilted now; the yard read as a Π, so it
  is a crane with a hook now.
- **Relays and your com-sats in space.**
  - They are a small model: a foil-wrapped body, two solar wings, and a
    dish facing the world. They are about 12 m across, and the model
    shows once one is close enough to resolve.
  - Further out, up to 25,000 km, a faint drawn mark stands in for one:
    blue for a public relay, green for yours, grey and slashed for a dark
    one.
  - **On the orbit map** they show at any range, but only once they stand
    clear of their world on the screen.
- **The RELAY panel.** It is a new page, selectable for any dashboard MFD.
  - **Who you are talking to:** the nearest live relay, or com-sat of
    yours, with a clear line to your ship, and how far away it is.
  - **This system:** how many of its worlds' relays are lit, which are
    dark, and whether the uplink is lit.
  - **The chain**, drawn with icons:
    - a sat for each star it runs through;
    - a line for each link;
    - a slashed sat for one that is down;
    - drifting wings for one destroyed but still expected;
    - a cut, dashed line where a link is out.
    - A marker shows where you are, and a dotted gap stands in for the
      middle of a chain too long to show.
  - **Which chain:** to your com-sat, else to your plotted star, else to
    the nearest claimed star.
  - **The bottom line** says LIVE and how many hops and hours, or where it
    is broken and that the far end is on the other chain.
  - **Destroyed relays:** nothing can destroy a relay yet. The state is
    read from `G.relaysGone` for when something can.
- Tests: `test/icons.test.js` (13 checks) runs every icon through a canvas
  that refuses text. `test/comsats.test.js` is up to 49 checks with the
  panel's helpers. Probes: `tools/probe-icons.js` and
  `tools/probe-relays.js` (the model up close, the chain whole and broken,
  the map).

### Added (2026-11-20, com-sats, slice 2: RTGs, dark relays, a broken chain, RTG fuel)

Astra, 2026-11-19: mil-sats and com-sats burn one fuel, refined out of
the mildrive's waste. Her correction on 2026-11-20: *"a break in the
relay chain turns the chain into two chains which can be re-connected."*

- **RTG fuel.**
  - It is a new good (`rtgfuel`, base 1,400 cr/t) and it is legal. Fissiles
    are not contraband, and nothing on the ladder sits below them.
  - It is registered the way contraband is, after the main list, so no
    existing market, tier order or route moves.
  - **Isotope refineries:** every reprocessing port, which already buys
    waste, now makes 0.8 t a day. It sells for about 900 cr/t at source.
    The COMMS row says "isotope refinery". The production is added when the
    system is handed out, after its traffic is built.
- **Relays go dark.**
  - Each world's relays share an RTG service cycle: a tender every 260 to
    620 days, seeded.
  - About one tender in five is late, by 12 to 75 days. For that time the
    world's relays are dark and its ports are islands. The COMMS row says
    "ISLAND - relays dark, tender due day N".
  - Measured: dark about 2% of world-days.
  - It all runs on the rails: hashes of star, world and cycle number.
- **A relay serves its own world.** It links the ports on it and over it,
  not the next planet. The first test found Mirven I's port still linked
  through Mirven II's relays while its own were dark.
- **Six relays a world, not three:** three orbital planes, with an
  opposite pair in each. With three, a ground pad saw none overhead about
  one time in eight and flickered in and out of the network through its
  day. A pair is almost always half above the horizon. With every relay
  alive, islands are now nearly all RTG lapses (21 in 1,095
  port-moments, about 2%).
- **The chain breaks in two.**
  - Each claimed system talks to its neighbours through one long-range
    **uplink**, with an RTG cycle of its own.
  - While the uplink is dark, the star drops out of the chain, which
    splits into two chains. Each half still works on its own.
  - **Two ways to rejoin them:** fuel the uplink, or have a live com-sat of
    yours in that system to bridge the gap.
  - Measured: with Mirven's uplink dark on day 532, its neighbour's chain
    reaches 37 stars instead of 53, and two of its six neighbours land in
    the other half.
  - "Your com-sats" says "uplink here DARK - chain broken" when you are in
    such a system.
- **Refuelling contracts.**
  - From 30 days before a dark date until the tender would have come,
    every port in the system posts **"4t RTG fuel for the relays over X"**
    to that world's port. Uplinks get one too, to the system's main port
    (the highport if there is one), paying half as much again.
  - **You bring the fuel yourself.** The contract hands you nothing at the
    desk (a new `bring` flag on a haul).
  - **Pay:** 2.2 × the fuel's base a tonne, 12,320 cr for a world's 4 t.
  - **One job, not one per port:** taking it at one desk takes it off all
    of them.
  - **Delivered in time:** the relays never go dark. **Delivered late:**
    they light again that day.
  - The only state is `G.rtgFixed`.
- **Your com-sat's fuel.**
  - A load lasts 365 days from launch or the last refuel. After that the
    sat is DARK and reads nothing.
  - **Refuelling:** "Refuel a com-sat" on your COMMS channel takes 1 t of
    RTG fuel, in orbit round its world.
  - The channel shows each sat's days of fuel left.
- All numbers are Claude's.
- Tests: `test/comsats.test.js` now has 45 checks: dark rates, islands
  during a lapse, posting, fixing in time and late, the chain splitting
  and rejoining both ways, the contract, the refinery and the sat's fuel.

### Added (2026-11-20, com-sats, slice 1: the relay network and your own com-sat)

Astra, 2026-11-19: *"you can own a com-sat, keeps you updated with trade
prices along the comsat's line of sight, basically, even across
systems."* A dead relay *"turns a station into an island which gets its
news by courier."* She agreed the model the same day: a chain of relays,
8 ly a hop, an hour a hop, in two layers. The public network is the
stations'; your com-sat is your terminal into it.

- **New code: `src/comsats.js`.**
- **The public relays.**
  - There are three in circular orbits round every world with a port,
    owned by whoever holds the system.
  - They are seeded (`relays|<star>`), so where each one is at any
    moment is a formula.
  - They are not bodies, so no port, route or fingerprint moves.
  - There are none in nobody's systems.
- **Linked and island ports.**
  - A port is linked while a relay (or a com-sat of yours) in its system
    has line of sight to it. Any world or star between them blocks it,
    and a surface port needs the relay above its horizon.
  - A port no relay can see is an **island**, and its COMMS row says so.
  - Measured over 40 stars: 5 islands in 1,095 port-moments, so islands
    are rare while every relay is alive.
  - Relays do not die yet. Slice 2 brings their RTG dark dates.
- **The chain between stars.** Any star a power claims is a node, and so
  is any star with a com-sat of yours over it. Nodes within 8 ly are
  joined.
- **Your com-sat.**
  - **Buying one:** at shipyards and highports, from the port's COMMS
    channel, for 85,000 cr. You can carry two.
  - **Launching it:** from your own COMMS channel, **"Your com-sats"**,
    while in orbit round a world. It goes into the orbit you are flying,
    at your height and in your plane.
  - It has to go at least 1.6 world radii out, and it cannot be launched
    from a deck or the ground.
  - The channel lists each sat you own, and whether you are LIVE and to
    how many stars.
- **Live prices.** With a com-sat on the network and your ship somewhere
  on that same network, the trade analyser reads every connected star's
  prices at **an hour a hop**. Its AGE column shows those in green hours,
  and its header line says LIVE. Off the network, or with no sat, news
  still rides the freighters at about 11.8 h per light year.
  - From Mirven, one sat reaches 53 stars, so one sat on a big empire's
    network covers all of it.
- **Saves:** your sats in orbit (`G.comsats`) and those aboard
  (`ship.comsats`). An old save has neither.
- **Why launching is on COMMS.** The first cut put **LAUNCH COM-SAT
  HERE** on the planetary scanner. The probe showed the scanner will not
  open without a survey instrument fitted, so a pilot without one could
  never launch, and the button moved.
- All numbers are Claude's except the 8 ly and the hour, which are
  Astra's.
- Tests: `test/comsats.test.js` (22 checks, in the economy group). The
  launch checks prove the sat starts exactly where the ship was, at its
  height, moving the way it was. Probe: `tools/probe-comsats.js`.

### Added (2026-11-19, the world's own drilling teams: new ground ports on a dated schedule)

Astra, 2026-10-17: drilling teams work for "both" the player and the world;
"there can and should be more than one land port per world sometimes";
and the dig is mission content ("3 and 4 are good": ferry the crew, supply
the dig). This is the world's side. The player's side is the drilling
team at your outpost.

- **New code: `src/digs.js`.** Each star has its own schedule of NPC
  digs, built from its own seeded stream (`digs|<star>`) and the system
  it generated. A dig has a world, a dry spot on it, a start date and a
  finishing date. On the finishing date a ground port opens there, with
  its own market and its own routes, whose first ships leave that day.
- **The extra ground ports from day one.** These are simply the digs
  that finished before day 0, so the same mechanism covers both. Measured
  over 60 stars: about 0.75 digs per system across roughly five and a
  half years of game time, and about 0.35 extra ports per inhabited
  system at the start.
- **Where digs happen:**
  - only landable worlds (the gravity rule comes first);
  - only dry ground (`Weather.dryAt`);
  - never in nobody's systems;
  - mostly worlds nobody lives on, where the new port is a mining head.
- **Nothing else moves.** The generator is untouched. A dug port is put
  into its system when it is open, the same way a station of yours is.
  Every existing port, route and seed fingerprint stays as it was.
- **Seeing them.**
  - The planetary scanner marks a dig in progress with a blue diamond
    and "DIG nn%".
  - If you are in the system on the day a port opens, you hear about it
    and it goes in the journal. A port that opened long ago is simply
    there.
- **Dig work on the mission board.** Ports in the system post jobs for a
  dig in progress, delivered to the dig's **depot**: the nearest civilian
  port on or over the same world. Navy carriers are excluded; the first
  probe had picked FNS Sovereign.
  - **Shoring:** structural alloys in 8 t batches, paying a quarter
    over an ordinary haul.
  - **Relief crew:** a passage for the drillers.
  - Each batch delivered, and each relief crew, brings the opening day
    **6 days** forward. It never goes earlier than the day of delivery,
    or than half way through the dig.
  - `G.digs` saves this, and it is the only state the digs keep.
- **Not built:** protecting a dig. Nothing attacks one yet.
- All numbers are Claude's.
- Tests: `test/digs.test.js` (32 checks, in the ground group). Probe:
  `tools/probe-digs.js` covers the scanner mark, the board and the port
  opening on its day.

### Added (2026-11-19, drilling teams: an outpost dug out into a port of yours)

Astra: "Drilling teams are engineers that can be ordered to work on the
surface at an outpost." What they do there was agreed on 2026-10-17: dig
the outpost out into a ground port of your own.

- **Setting them down.** Land at your standing outpost, pin its cell on
  the planetary scanner, and click **SET ENGINEERS DOWN TO DIG**.
  - Every engineer aboard goes down.
  - They stay on your books and draw their wage. The crew screen says
    "DRILLING ON …", and they cannot be dismissed while they are down.
  - Your ship flies without them.
- **What it costs:**
  - its stores, 40 t of structural alloys over the whole dig, hauled
    down (see "the dig's stores" below);
  - a station licence where the law wants one, the first time. A port is
    a station, and a Syndicate forged blank serves, as it does for a
    Crawler.
- **How fast.** Each engineer digs 0.6 + 0.2 × their rating a day, out of
  120 in all:
  - one good engineer takes about 100 days;
  - an excellent and an exceptional together take about 40.
- **Fetching them back.** **FETCH THE TEAM BACK** brings them aboard, and
  the dig keeps what they did; it does not move without them. Setting a
  team down again costs no more supplies.
- **On the rails.** The dig is a record of the work done by a given moment
  and the team's rate since. Every change to the team re-bases it, so the
  finishing day is a formula and skipping time is exact.
- **When it finishes,** wherever you are, the outpost opens as a **mining
  station of yours** (`Stations.foundDug`):
  - it stands on the outpost's spot, open from the day the dig finished;
  - it has its own NPC traffic from that day, as any station of yours does;
  - it has no Crawler over it, so there is no orbital half;
  - its upkeep runs on a 300,000 cr build cost.
  - Your engineers wait there: dock (or land at the outpost) and they come
    aboard.
- **The ground pointer** at a standing outpost now says "N empty the claim
  at the outpost", not one drone's keys.
- All numbers are Claude's.
- Tests: `test/outposts.test.js` now has 43 checks. Probe:
  `tools/probe-outpost.js` (the button, the team down, the status line).
  stations, construction, crew, rescue, claims and the save round trip
  all pass.

### Changed (2026-11-19, the dig's stores are hauled, not a flat fee)

The first cut charged 60,000 cr up front for "the dig's supplies". Astra
left the choice between that and hauled tonnage to Claude, and Claude chose
hauled tonnage. Supplying your own holdings is one of the three loops she
asked for (2026-10-18), and the dig is the first holding that needs
supplying.

- **What the dig eats.** 40 t of **structural alloys** over the whole dig,
  a third of a tonne per unit of work, eaten as the work is done.
- **Two ways to get them there**, both from the scanner strip while you
  are landed at the outpost:
  - **UNLOAD ALLOYS FOR THE DIG** takes what is in your hold, up to what
    the dig still wants. Bought at market, 40 t is about 10,600 cr.
  - **GUILD BRINGS STORES IN** pays for the whole shortfall delivered, at
    three times the going rate: 31,800 cr for all 40 t. It is the
    convenient way, and the dear one.
- **Running out.** When the stores run out the dig **stalls**: the team
  waits there and still draws its wage. You hear about it once, wherever
  you are, and the status line says STALLED and how many tonnes it is
  short.
  - A team set down with no stores at all is told so straight away, and
    is not announced a second time.
- **On the rails.** The record also keeps the stock on site at its
  moment. Work done is capped by what that stock can shore, so the stall
  day is a formula like the finishing day.
- **Setting a team down is now free.** It needs only the licence, the
  first time.
- **Older saves.** A dig started before this change has no stock field.
  It reads as fully supplied, because it was paid for in full.
- The mining test save's shuttle, Groundbreaker, now carries 30 t of
  alloys, so both routes can be tried: unload those 30 t, then either fly
  back for 10 t more or contract the rest in.
- All numbers are Claude's.
- Tests: `test/outposts.test.js` now has 58 checks, covering unloading,
  the stall, the contract, the legacy dig and recall keeping the stores.

### Fixed (2026-11-19, the planetary scanner's marks are legible over every colour)

Astra: "on the scanner display the selected point, the grid lines and the
font need to be dynamically chosen to be visible on the scanner display in
any of the colors it uses. They aren't, currently."

- Rather than pick a colour per pixel underneath, every mark is now drawn
  twice: a dark halo first, then the coloured stroke on top
  (`scanHalo`, `scanText` in `src/screens.js`). A light line with a dark
  edge reads on black, teal, green, orange and the white-pink "richest"
  alike, so nothing has to sample the map.
- **Grid lines** are a brighter white (0.42 alpha) with a faint dark edge.
- **The selected point** is a warm-white box with four outward ticks, all
  haloed. It stays visible when it sits on the brightest ore.
- **Text and lines** on the map get the same treatment: field lines and
  their arrowheads, pole rings and N/S, the ground track and its arrows,
  drone marks, the outpost square and its label, and the ship marker.
- Checked by eye at 1×, 4× and 8× over a rich deposit
  (`tools/probe-scanner.js`).

### Added (2026-11-19, saves to and from a file; a mining test save)

Astra asked for a save "with a ship that has all the right gear, crew and
another ship for sending my engineers down to the planet to test the
mining stuff with".

- **Export and import.** On the pause menu's save page, **X** writes the
  highlighted slot to `manifest-<label>.json`. On the load page, **I**
  picks a `.json` file and puts it in the highlighted empty slot (or the
  first empty one), then loads it. The record keeps its version check.
  The footer names both keys. (`Save.recordText`, `parseRecord`,
  `writeRecord`.)
- **`tools/make-mining-test-save.js`** builds the test save through the
  game's own code and writes it with the probe's new `file()` helper:
  - Mirven system, docked at Halden Depot, 748,678 cr, tutorial done;
  - the Mule **Prospect**: deep-survey scanner, 2 drones, pilot Teo Brill
    and engineer Ama Hoyt. Mirven I a is fully surveyed, the claim is
    filed, and a real station licence is held;
  - the heavy shuttle **Groundbreaker**, parked at the same port, with
    engineers Kes Lund (3) and Mira Sable (4). Crew can't move between
    hulls, so the drilling team rides the hull that lands.
- **`tools/electron-probe.cjs`** gives probes a `file(name, text)` helper
  that writes into the probe's output folder.

### Fixed (2026-11-22, the hand on the beacon was still being paid)

1.5.2 made the crew roster mean the right thing: a hand outside or adrift
stays on the books with an `out` flag, rescues no longer duplicate her, the
dead are struck off, old careers reconcile on the first frame, and
`Crew.present(ship)` is the list of who is actually at their post. The ship
screen even refuses to pay off somebody who is out there.

**Three callers never moved across, and one of them costs credits.**
Measured on 1.5.2 before anything was touched: with Ada Vance adrift on a
beacon, `Crew.present` is one hand at 54 cr/day and `Crew.aboard` - which
under this naming is the whole books - is two at 122.

- **`fleet.js` billed the books.** She was paid **68 cr/day to fall away
  behind the ship**, which is the one thing crew.js says out loud a wage
  does not do: *"a wage that runs while they are aboard."* The desk now
  settles against who is at their post.
- **The medic reported "2 aboard, and everyone fit to work"** while one of
  the two suffocated on a beacon.
- **And she was still drawn walking the decks as an NPC**, standing in the
  corridor and adrift at the same time.

**Deliberately not changed**, because they are right as they stand: the
three places that REBUILD `s.crew` (paying a hand off, signing one on, a
friend coming aboard) need the whole books or they would erase her;
`concourse.js` marks who is signed on so the hiring hall cannot re-offer a
woman who is already yours; and `recap.js` walks the books on purpose, so
it can report who is *not* aboard.

- **Saves:** unaffected. The flag and the roster are 1.5.2's; this only
  changes who reads which list.
- **Tests:** `test/fleet.test.js` 218 -> 223, asserting through the real
  `Fleet.settle` rather than against a list, because the list was never
  what was wrong - the money was. Confirmed to fail against the old line:
  1,360 cr billed where 680 was owed.
- **Also:** the lockfile drifted again, immediately. `package-lock.json`
  shipped in 1.5.2 still saying 1.5.1, having previously sat at `0.1.0`
  since before 1.0. `release.test.js` pinned release.js against
  package.json and never looked at the third copy; it does now, 6 -> 8
  checks.

## 1.5.2 "Rhombicuboctahedron" (2026-11-19)

The stations come alive, and the first piece of mining's last stage. A
rhombicuboctahedron is a hub with a face turned every way: eighteen
squares and eight triangles, every one of them a way in, which is the
release where the concourse, the bar and the claim each got somewhere to
go and something true to say.

- **Last time on...** when you pick a career back up, and missions say how
  far off their target is.
- **The station speaks:**
  - a departures board read off the real timetable;
  - a PA, and lines overheard in passing;
  - now and then, somebody who has heard of you;
  - the sound of each room.
- **Wanted and on the deck,** security detains you. If you can't pay, you
  can work the fine off on half-pay contracts.
- **Menus** sit over wherever you are standing.
- **The bar's fixer** has work, grey goods, papers, word of who is looking
  for you, and a way into the Syndicate. **The concourse** has a
  noticeboard of the port's real contracts.
- **Outposts,** built by your own drones on a claim.
- **Fixed:** the ramp's flickering seen from inside the ship.

> **Saves survive.** No version bump. The new records (`workoff`,
> `outposts`) are additive, and an older career loads with none.

Astra asked for this as 1.4.2. The last release was 1.5.1, so the next
patch number is 1.5.2. Polytope names since 1.4.0 (src/release.js).

### Added (2026-11-19, outposts, built by your drones)

Astra: "Outposts are constructed by mining drones." The first piece of
mining's last stage that was still missing; the order of the rest is in
the project doc `claude/after-mining-roadmap.md`.

- **What it takes:**
  - two of your drones on a live claim;
  - 15,000 cr for the Mining Guild's frame.
- **How it is built:**
  - the drones build it where one of them stands, in 40 drone-days (two
    drones take 20 days);
  - while they build they dig nothing, so part of the price is their time.
- **Once it stands:**
  - every drone on the claim feeds its bins and holds 90 t instead of 30;
  - N at the outpost empties the whole claim at once, richest first;
  - thieves come half as often.
- **Ordering it:** from the planetary scanner. Pin a cell that has one of
  your drones on it and click **DRONES BUILD AN OUTPOST**. When the button
  is off, the line beside it says why: one drone, a lapsed claim, the fee,
  or one already there. The outpost is drawn as a square on the map, dashed
  while it is being built, and announced once when it stands.
- **On the rails:**
  - the drones' hoppers are re-based to the day it stands, so the bigger
    bins are exact rather than backdated;
  - a drone emptied or set down while it is being built also waits for it;
  - skipping a month gives the right answer.
- **Not yet:** a model on the ground. Your drones have none either.
- **Saves:** `G.outposts`, additive. Old careers load with none.
- Tests: `test/outposts.test.js` (23). Probe: `tools/probe-outpost.js`.
  claims, mining, prospectors, survey and the save round trip all still
  pass.

### Added (2026-11-19, the fixer's business, and a noticeboard)

Slice 2 of the engaging-stations plan. Astra: "let's keep going".

- **The bar's fixer now has business** (`src/fixer.js`). "What can you do
  for me?" opens a sheet of five:
  - **Is there work?** One job per port per contract window (two days).
    - Over a black market it is smuggling: real contraband sold at this
      bar, loaded into your hold when you take it, for a real port in the
      system.
    - Elsewhere it is holing a lawful port in the system with a rock
      torpedo.
    - Both are ordinary contracts on the ledger (`smuggle` and `sabotage`),
      booked against the Syndicate. Finishing one is +3 Syndicate standing,
      and the fee goes through the fine garnish like any other.
    - Once you take it, the fixer says when the next one comes.
  - **Where can I buy a gun nobody certified?** "Right here" when this
    system's corruption opens the grey shelf. Otherwise the nearest systems
    within 10 ly whose corruption does, with distances. Forged papers are
    never for sale: the fixer says the overboss gives them to people who
    see the Long Arrangement through, which is how the game already works.
  - **Can anyone here change a ship's papers?** The old PAPERS line, moved
    into the sheet.
  - **Is anyone looking for me?** Your fines, by faction and amount, and
    any navy whose notoriety for you is at or near sending hunters.
  - **How do I get in with the Syndicate?** The old standing line, plus how
    many jobs short of the Long Arrangement's gate you are. At the gate it
    tells you the favour is on the contract board. It also covers a navy
    allegiance (the door is shut), a pirate mark, a chain in progress or
    done, and a chain on cooldown.
  - The fixer's top list is now *Who are you / What have you heard / What
    can you do for me / tithe / friends*. PAPERS and STANDING live in the
    sheet, so nothing fell off the five-line list.
- **A noticeboard in the concourse:** cork in a wooden frame, at eye
  height west of the door in from the cargo hall.
  - One paper slip per contract the port is letting, dealt exactly as the
    F7 board deals them (chains first, less what you have signed).
  - Each slip shows its headline and fee, readable within a few metres.
    From across the room the slips are blank paper.
  - E on it opens the contract board.
  - First draft: Astra saw the slips' text overlapping itself, in a font far
    too large. It is now small handwriting: three lines at most, an
    ellipsis when it runs long, and the fee on its own line. The board's tag
    floats above its frame instead of across its header (items can now
    carry their own `labelY`).
- The two boards share one sight-line test (`boardSightClear` in main.js).
- Tests: `test/fixer.test.js` (34). Probe: `tools/probe-notices.js`.
- Not done: "collection" jobs (collecting a debt for the fixer). They need
  a settlement path the ledger does not have yet.

### Changed (2026-11-19, menus show where you are)

Astra: "make menus show where the player is."

- **On a station's deck** (and in a sea platform's tube), any page of the
  pause menu now sits over the deck you are standing on: the Esc menu, the
  options, "Last time on...", being detained. Before, it swapped the deck
  for the cockpit view behind its dimming. The title card still covers
  everything: it is not anywhere.
- **Fixed on the way: aboard on foot and in the suit, the pause menu was
  open but invisible.** Both views return before the flight HUD, which is
  where the menu was drawn. Esc stopped the world and showed nothing; a
  second Esc closed what you couldn't see. Each of those views now draws
  the menu itself, and so does the deck.
- The menu clears the click list as it draws, so nothing on the deck behind
  it can be clicked (the probe counts five hotspots with it open: its own
  rows).
- The board's line-of-sight height went from 2.9 m to 3.4 m: the concourse
  kiosk's canopy stands taller than 2.9, and the rows were written over it.
- Seen in the real build: `tools/probe-menudeck.js` (the Esc menu over the
  concourse) and `tools/probe-menuaboard.js` (over the cockpit room aboard).
- Aboard, the first Esc only releases the mouse from mouselook; the second
  opens the menu. That is the browser's pointer lock, not this change.

### Added (2026-11-19, detained when wanted, and working a fine off)

Astra: "security should detain you when you're wanted, but if you don't have
enough money to pay your fine that shouldn't be game breaking, instead, the
option to run missions for that station/faction until your fine is paid off,
and the missions pay half as much?"

- **Detained on the deck.**
  - With a bounty on you with a port's faction, the port's law comes for you
    a few seconds after you step onto its deck. This happens every time,
    with no roll.
  - The nearest officer walks over and follows you as you move.
  - With nobody on watch, the PA pages you and the next officer through the
    door comes for you.
  - The detention page gives two choices:
    - **pay** the settle cost: the bounty plus costs, 1.6x, as on the police
      channel;
    - **work it off.**
  - Esc does not let you leave the page.
  - A bounty past what a port will overlook still gets the dock refused, as
    before. Settle that one from the police channel at a port that will take
    you.
- **Working it off** (combat.js `workOff`, `garnish`):
  - What settling would have cost becomes a debt to that faction (1.2x for a
    fugitive turning themselves in).
  - The bounty and any fugitive flag clear at once, so their ports open and
    their police stop asking.
  - Every contract for that faction then pays you half, and the other half
    goes to the debt, never more than is owed. The contract's completion
    line says how much went to the fine and how much is left.
  - When the debt is paid, their contracts pay in full again.
  - Standing still moves the way a contract moves it.
  - Every contract payment goes through one place (missions.js `creditFor`):
    hauls, passages, sabotage, carrier deliveries, intel and fieldwork.
  - Campaign chapter bonuses (arcs.js) are not garnished.
- **The police channel** gets the same way out: when the quote is more than
  you have, a second Y agrees to work it off.
- The debt shows on the contracts screen's standing list ("working off
  960"), and in "Last time on..." under THE LAW.
- Saves: `workoff` is additive. Older careers load with no debts, and there
  is no version bump.
- `test/workoff.test.js` (17); probe `tools/probe-detain.js`. In the real
  build at Threshold, with a 600 cr bounty and 100 cr: Zeke Lund of port
  security came for you, Esc was refused, and working it off left a 960 cr
  debt and no bounty. You were not detained again.
- The board, the PA and the approaches read the port's faction as the law
  does (`port.faction`). The first draft read a field ports don't carry and
  fell back to the star's faction.

### Added (2026-11-19, the sound of a station)

Astra, on station sound: "sound effects, yes." Synthesised, like every other
sound in the game (sound.js):

- **A bed per room**, crossfaded as you walk through a door. It has five
  layers:
  - mains hum (50 and 100 Hz);
  - a crowd murmur (band-passed noise, breathing on a slow LFO so voices
    come and go);
  - machinery rumble through the deck;
  - ventilation air;
  - in the bar only, soft music: a slow walk round A minor, one note at a
    time.
- Levels per room kind: bar, concourse, crew hall, cargo hall, spine, L
  port, berth/hangar, tube.
- **Now and then:** freight clanking in the cargo hall, the L port and the
  hangar, and a forklift's reverse beeps in the cargo hall.
- **The PA chimes** (two notes) before it speaks. **Detention** has its own
  sound.
- Only on a station's deck: aboard, in flight and on the title card there is
  no bed. Mute silences it as it does everything else.
- Not checked by ear: the probes run muted, and I can't hear the game.

### Added (2026-11-18, the station speaks)

Astra: "I want the first person stations to be more engaging", and of what
that means, all four of: people doing things, places to use, a lived-in
look, things happening. The plan is in `claude/engaging-stations-plan.md`;
this is its first slice. Everything the station says is read off the game,
the rule the signs already keep.

- **A departures and arrivals board** over the door from the cargo hall into
  the concourse. Real ships, real destinations, real times, off the traffic
  timetable: AT BERTH and BOARDING agree with the berth queue
  (`Sim.berthOccupants`); SCHEDULED, EXPECTED and APPROACH are the routes'
  own arithmetic. The foot carries the station clock and, when there is a
  bounty on you here, port security's notice of it. E at the board reads out
  the next sailing and the next arrival.
  - It replaces a stand-in on the same wall that was rows of random-length
    bars. The three hanging signs by the door (< BAR, ^ BERTHS, CREW >)
    moved to 1 m in from the wall, so they no longer hang across the board.
  - The rows are drawn in 2D over the GPU view, in perspective on the
    screen. A column is left off when a counter or prop stands between you
    and it below 2.9 m. People standing in front are not tested, so the rows
    still draw over them.
- **The PA**, now and then (75-120 s apart, real time), and never over a
  conversation, a menu or a line still on screen:
  - a sailing due in the next ten minutes;
  - an arrival on final approach;
  - your bounty ("Port security: be advised, a Talon Courier in port is
    flagged, 600 credits outstanding");
  - what the market desk is short of;
  - how many hands the crew hall has;
  - the next sailing.

  Each is said once a visit, and a sailing once per sailing.
- **Overheard as you pass** (within 2.4 m, once a person a visit):
  - docked crews talk about their own ship's sailing ("We are out for Halden
    Depot in 2.4 h. Drink up.");
  - others say what this port has heard about you, in the rumour network's
    own words, or what the market is short of.

  Staff at counters and the law don't chatter.
- **Somebody comes over**, now and then. Astra: "it should be a nice
  surprise; not super often, more with higher notoriety."
  - At most once a visit, from one roll seeded by port and game day.
  - The chance is 8% when nobody here knows you. It rises 10% per point of
    how known you are here, capped at 60%. That score is the rumour
    network's weighted count of everything this port has heard of you, plus
    a tenth of the navy's notoriety, plus one if there is a bounty on you
    here.
  - The nearest person who might, within 22 m, walks over by the deck's own
    routing, stops facing you, and says the loudest true thing about you
    here, in the rumour network's own words, with their reaction:
    - grateful for a rescue or a dead raider;
    - wary of a pirate or a killer;
    - a warning that security or the navy are asking after you.
  - Anyone not hostile adds a true tip: a port in this system short of
    something in your hold ("If that is wine in your hold, Halden Depot is
    crying out for it"), or short of anything at all.
  - If there is nothing true to say, nobody comes. E talks to them as to
    anyone else.
  - Staff, the law and your own crew never come over.
  - npc.js `approach`; main.js `stepApproach`; probe
    `tools/probe-approach.js`.
- The ship is named as the game names her elsewhere (`shipName`).
- `src/concourse.js` (`Concourse`), pure; main.js `updateConcourse` and
  `drawInfoBoards`. `test/concourse.test.js` (31). Probes:
  `tools/probe-concourse.js`, `tools/probe-approach.js`.
- Not in this slice: sound (that waits on Astra's answer about generated or
  recorded), and wanted posters of other people (the game keeps bounties
  only for you).

### Fixed (2026-11-18, the ramp flickered from inside the ship)

Astra: "the ramp into the station has flickering textures when looking down
it from inside the ship". Walking aboard while berthed, the view drew both
the walk hangar (down her ramp, out of her windows) and the station model.
That was harmless while the walk hangar was a box of her own size inside
the model's bay; since the hangar became the berth itself (below), its floor
and walls lie exactly on the bay's, and the two fought beside the ramp.

- **On foot in a berth hangar the station model is not drawn**, as the chase
  camera and the seat already did not draw it (main.js `hangarAboard`).
- Checked in the real build (tools/probe-rampflicker.js): the comb pattern
  either side of the ramp is gone and two frames are identical. The hangar
  floor past the ramp now reads darker - the model's brighter floor had been
  showing through it.

### Added (2026-11-18, "Last time on..." when you pick a career back up)

Astra liked the idea of a recap on loading a career. A card over the stopped
world, once per launch on Resume and on every slot load: where you are, the
ship and the money, open contracts (overdue first, each with its live
distance and trip time), hands outside or adrift, bounties by faction,
favours owed either way, and the last few journal lines with how long ago.
A section with nothing to say is left out; a career with nothing on any list
gets no card. Any key or a click closes it.

- `src/recap.js` (`Recap.build`) reads only through the functions the other
  screens use (`Missions.reach`, `Outside.statusOf`, `Journal.debts` and
  `entries`), so it cannot disagree with them, and writes nothing.
- A page of the pause menu (main.js `openRecap`, `drawRecapPage`), so the
  world is stopped while you read it.
- `test/recap.test.js` (13). Probe: `tools/probe-recap.js`.

### Added (2026-11-18, missions say how far away the target is)

Astra: "I also want the missions to describe how far away the target is."
Every row on the F7 board and every active contract now has a line: the
distance from where your ship is now and the trip time, or light years for
another system ("8.1 ly away, in the Cyynx system").

- **Live, not written into the text**: planets move, and a number fixed when
  the job was posted is wrong by the time you have flown half of it.
- **The time is the intercept pip's own solve** (main.js `etaTo`, published
  as `MissionEta`): the faster of cruise and thrusters, as you would fly it,
  with the drive assumed even on the clamps. The first draft used a
  flip-and-burn on thrusters and said "2.2 days" for a hop the cruise drive
  makes in a minute. Cached 3 s per port and at most one fresh solve every
  40 ms; measured 0.2 ms a solve.
- Rows on the board are one line taller, so a long board shows one row
  fewer before it is cut off.
- `Missions.reach(G, m)`; `test/reach.test.js` (11).

### Fixed (2026-11-18, nothing fires on the rail)

Astra, on the lift at Threshold: jets showing "when nothing should be
firing, and they're in the wrong direction to the direction of motion".
The rail sets her pose every frame - a car and a traverser carry her - but
the controls still turned any key held during the ride into thrust, and the
plume was drawn off it, pointing wherever the keys pushed while the rail
moved her its own way.

- **While the rail has her, her commanded thrust is zero** - keys, flight
  assist and vector assist alike - so no plume or RCS puff is drawn.
- Measured in the real build (tools/probe-railjets.js, Threshold transfer,
  W and D held, assist on with the dock targeted): 141% of max thrust and
  two thrusters live before, zero and none after.

### Fixed (2026-11-18, the inclined lifts are level pads)

Astra, at Threshold Dock: the ship "half its hull embedded in the cargo lift
instead of sitting on the cargo lift", and of the lift itself: "the platform
sticks out perpendicular to the direction of vertical travel so that when it
slides up to the top, it blocks the hole". The art's car on every incline
(cradle, cylinder, spine and skimmer bores) is a tilted panel, and the hull
was stood level on it at the panel's middle - so the panel's uphill half
rose through her.

- **Every inclined car is now drawn as a level pad:** a flat deck on the
  car's own footprint, with a wedge under it riding the shaft's real floor
  (measured by vertical casts along the run), hazard stripes at both ends.
  Plumb and flat cars, and the ground pad sites' transfer cars (already
  level slabs), are left as they were.
- **The seat stays where every route was laid** - the level stubs on and off
  each lift - and is raised only where a hull on it would be in the incline:
  the cradles' (12 m into the floor at a hull's uphill end before), not the
  spines' (16 m clear already). The pad ends uphill where the floor climbs
  to meet its deck.
- Collision still sees the art's car where it was, as before.
- **Still owed, waiting on Astra's eye:** the recess at the foot, the flush
  landing at the head, and clipping the shaft where it pokes into the level
  below.
- **Tests:** lanes 7/7 (she rides seated on the car, every model), interiors
  39/39 (every routed leg clear of the hull - the first cut of this, which
  stood the pad on the floor, put four spine legs through their landings and
  was caught here).

### Fixed (2026-11-18, no sky painted over a station's walls)

Astra, in the cutaway in Threshold's bore: Mirven's glow and name, planet
labels and the orbit line drawn straight across the walls. The cutaway
draws the station from outside with a cone cut through it, so the sky is
meant to be there - but the labels, markers, glows, orbit lines, the grid
and the predicted path are flat overlays with no idea a wall is in the way.

- **Within four radii of the station you are looking at** (its cut, or from
  outside it with the cut off): no ecliptic grid, no orbit lines, and no
  predicted path while you are docked or on a rail.
- **A body or ship whose line of sight runs through the station's metal is
  not labelled, marked or plumed over it** - the sun and its glow, planets,
  moons, other ships. Tested by marching the station's occupancy grid; its
  48 cells are coarse, so a label can still slip through a thin wall.
- The station's own name and marker stay.

### Fixed (2026-11-18, the hangar is the berth you are in)

Astra, docked at Threshold Dock after Halloway's run: a black S-size room
stood in the middle of the L bay she had been put in, visible through the
cutaway. The walkable hangar was always her hull plus 7 m of floor, and
nothing ever asked the station where its own walls were.

- **The hangar you walk down the ramp into is now the station's berth,** at
  its real size: at Threshold, 52 x 104 m with a 30 m ceiling instead of a
  26 x 40 m box. She stands where she was parked in it, not centred.
- **Measured off the walls, not read off a box.** Neither box the model
  carries is the bay's floor (the berth anchor and its section are both a
  2.6 m slice at Threshold), and the collision grid is 48 cells across the
  whole station. So it uses the chase camera's own ray casts against the
  station's triangles (Render.boomLimit) in her four level directions and up.
  A side open to space is held to 40 m past her hull.
- **Where the station cannot be measured** (no walls found, as at Harrow
  Hold's shed) the old hangar stands; nothing is invented.
- The door out to the spine, the bar and the concourse is unchanged - that
  part of the deck is still procedural, as agreed.
- **Tests:** `test/walk.test.js` 36 (was 30): the hangar takes the bay's
  width, depth and height, she stands off-centre where she was parked, and
  without a measure the old hangar stands.
- **Saves:** unaffected.

### Fixed (2026-11-18, turning portraits draw with a depth buffer)

Astra, at the market: the Medical supplies crate turning in its card had a
black triangle cut into its face - "probably all rotating items have this
bug". They did. The portrait painter sorted whole triangles by their middles
and could not cull back faces (the art's winding is half and half), so a big
face's middle often sorted in front of the small inset panel on it.

- **Item portraits and the showroom's hull portraits now draw on a small
  hidden WebGL canvas with a real depth test** - the same camera, light,
  colours and outlines - and are copied into the card. No WebGL: the old
  painter draws as before.
- **The item camera stands further back** (ITEM_FILL 2.8 -> 3.4): a cube's
  corner is 1.73 reaches out and the old framing showed 1.46, so every
  crate ran off both edges of its card twice a turn.
- Seen in the real build: six items at six angles, nothing cut or popping.

### Fixed (2026-11-18, the crew roster is the books)

An interaction hunt on 2026-11-15 ran the EVA code (`outside.js`) against
the crew roster and found four ways they disagreed. Astra settled what the
roster MEANS: *who is on your books* - so a hand outside or adrift stays
listed, flagged, and only death takes them off.

- **A hand cast off the hull no longer shows as aboard.** They stay on the
  crew screen as `ADRIFT, 6 HOURS AIR` (or `OUTSIDE ON THE LINE, ...` while
  working the hull) - that line is the prompt to go back for them. You
  cannot pay off someone floating in space.
- **A rescue no longer makes a second copy of them.** Three round trips
  used to leave four of Ada Vance; now there is one, flag cleared.
- **The dead come off the roster.** A hand who died on the hull used to
  stay listed, so the engineer check still counted her and the game would
  send the dead engineer out again. Death now strikes them off - which
  also stops their wage.
- **Stopped beacons no longer pile up in the save.** They are kept a week
  of game time, then let go; the journal is where the death is remembered.
- **Who is inside her vs who is signed on.** New `Crew.present(ship)` is
  the physically-aboard list; the turret, gunnery console, best-hand picks,
  the co-pilot's seat, crew walking the decks, and the "send an engineer
  out" check all use it. `Crew.aboard` stays the whole books, because every
  hire writes through it.
- **Wages:** a hand who is adrift is still your crew and still draws a
  wage; the dead do not.
- **Housekeeping:** `package-lock.json` now carries the real version
  (1.5.1) instead of the 0.1.0 it was born with.

**Saves:** survive, and are mended. A career saved under the old bug is
folded back into shape on the first frame - a doubled hand becomes one,
a dead one is struck off (once - an old beacon can never strike a later
hire), and the outside/adrift flags are set from what is actually out
there rather than trusted.

**Tests:** `test/outside.test.js` 87 (was 65) - every one of the four
failures, three rescues in a row, deaths on the hull and adrift, six
deaths and the week's pruning, an old-bug save mended, and two id-less
hands kept apart. `test/crew.test.js` 40 - the books against who is
inside.

### Changed (2026-11-14, the build moves onto the card)

Astra: *"starting now, we're going to put the version number on the title
screen."* It was already on it - bottom right, 11px at 55% opacity, with
its own comment saying "in the corner and out of the way" - which is faint
enough that she had never seen it there, so it was doing none of the work a
version on a title screen exists to do.

- **It sits under the seed caption now**, centred beneath the compass rose:
  `seed "kawartha" - 450 stars` and `1.5.1 "Icosidodecahedron"` on
  consecutive lines, the second a shade dimmer so the card still reads top
  down. The two answer the same kind of question - which universe, which
  build - and belong together where the eye is already going.

- **Tests:** `test/render.test.js` grows to 1,147 and now holds the
  convention rather than just the code: it reads the version and the name
  off the live `Release` (so cutting a release cannot make it fail) and
  insists the build is drawn close behind the seed, not exiled somewhere
  else on the screen. Writing it turned up two things about the harness
  worth knowing:
  - **render.test.js never loaded `src/release.js`**, though index.html
    does and release.test.js pins that it does. The harness was drawing a
    title screen the real page never shows.
  - **The card fades in on real time**, so at `frames(2)` it has no
    opacity at all and the only thing on screen saying "seed" is the
    menu's own hint on the Resume row. The older check that claimed to
    prove "the title screen draws" by finding `seed "` has in fact been
    matching that hint, not the caption it names. Left alone for now - it
    passes for a real reason - but it is not checking what it says.

- **Saves:** unaffected. A caption.

## 1.5.1 "Icosidodecahedron" (2026-11-14)

A repair release, and an unusually honest one: most of what is below
was found by going looking for it rather than by anybody hitting it.
Four faults in the game, four more in the suite that was supposed to
be watching the game, and two in the wiki pictures that shipped last
night. The name is the solid that is both of the last two at once,
because this fixes things from both of them.

### Fixed (2026-11-14, a promise the catalogue had never kept)

- **`Catalogue.note()` WAS CALLED FROM NOWHERE.** It was written, exported
  and documented when the catalogue was built, and its own comment makes a
  promise - *"so an unlisted item he has owned and sold stays in his
  reference"* - which had never once been kept, because nothing ever called
  it. `owns()` read a `seenItems` map that nothing ever wrote. Found by
  the bug hunt asking who calls it; the answer was nobody. (The same hunt
  found that `seenItems` was not saved either, so even once filled it
  would have emptied on reload - both halves are fixed.)
- **What counts as having laid eyes on a thing**, Astra's rule: anything
  you have ever held. So the record is now **swept from what is aboard** -
  the fit, the hold, the hull she is flying, a Crawler's bolted-down
  modules, and the hulls and fits of anything parked in the fleet - rather
  than noted at each place a thing can arrive. That is deliberate: a dozen
  calls at every route into your hold (bought, looted, salvaged, scooped,
  traded for, pulled off a wreck) is exactly the shape that rotted the
  first time, and it would rot again the first time a thirteenth route was
  added and nobody remembered the list. A sweep catches all of them,
  including the ones nobody has written yet.

- **Saves:** additive. An existing career starts filling its reference from
  what is aboard the moment it loads; nothing is lost, and nothing it had
  before is changed.
- **Tests:** `test/catalogue.test.js` grows to 34. The checks that matter
  are that the sweep writes the fit, the hold, the hull and the fleet - and
  then that **selling it all does not take any of it back out**, which is
  the promise the comment made and the code never delivered.

### Fixed (2026-11-14, the ports were lying on their sides)

Astra, looking at the finished wiki page: *"the projection reads as tilted
on its side - all of them do."* They were, and it was one line.

- **EVERY PORT PORTRAIT WAS DRAWN A QUARTER TURN OVER.** `localToWorld`
  multiplies a mesh vertex out as `right*x + up*y + fwd*z`, so the field
  called `up` is **where the mesh's Y axis goes** - not the world's
  vertical. That is the cockpit and hull convention, where models are built
  y-up and z-forward, and `drawHullPortrait` and `drawItemPortrait` are
  right to use it. A PortLib station is built **z-up**: `Sim.stationBasis`
  hands the renderer `up: normal` for the orbit normal, and main.js places
  a port with `fwd = basis.up`. `paintPortIso` had been given the hull
  frame, read by its field names rather than its arithmetic, so every
  station's Y went to world up and its Z went out sideways. The ring station
  stood on its rim like a tyre; the ground ports came out as grey slabs seen
  edge-on. A z-up model wants the identity, and the camera supplies the
  vertical. **The live game was never affected** - that path had the mapping
  right all along, which is also why this is not the docking wall-clipping.
- **AND NOW GROUND PORTS SHOW WHAT THEY ARE.** Astra: *"for ground ports,
  perhaps the projection should show the underground portion?"* A ground
  port in this game is a shaft cut DOWN into rock, and measured across the
  five patterns, **68-93% of one's vertices are below the ground line** -
  hidden under a handful of very large plate triangles, at the one camera
  angle that puts the plate between the eye and all the rest of it. The
  portrait is sectioned now, the way a drawing of a building is: the
  quadrant nearest the viewer is taken away, plate and shaft wall together,
  top to bottom. Cutting only the lid would open a hole to look down while
  the near wall still stood in front of everything inside. Cut before the
  decimation, deliberately - a quarter fewer faces means the 14,000 budget
  buys more detail, and spends it on the half nobody could see before.

- **Saves:** unaffected. Pictures.
- **Tests:** `test/lore.test.js` grows to 49. The new pair is deliberately
  not just a restatement of the frame: one holds the frame to the identity,
  and the other PROJECTS each ground port and insists a plate comes out
  **wider than it is tall**, which is the thing anybody looking at the page
  could see. Both were confirmed to fail against the old frame before being
  kept - "Mountain works: 1.37 wide by 2.24 tall", a landing field standing
  on its end. New tools: `tools/probe-portaxes.js`, `tools/probe-portdepth.js`,
  `tools/probe-groundline.js`.

### Fixed (2026-11-14, a bug hunt through everything new)

A deliberate sweep of what has landed since the last hunt: `charts.js`,
`lore.js`, `outside.js`, `catalogue.js`, the chart camera, the hull reprice
and the thicker disc. Every finding below was **reproduced by a script before
anything was changed**, and every one now has a test that fails without its
fix. Two of them were quietly costing players something.

- **FOUR PIECES OF A CAREER DID NOT SURVIVE A RELOAD.** `outside`, `adrift`
  and `crewRep` were written into the save payload from the day the EVA work
  landed and read back by nobody; `seenItems` was never written at all. The
  comment sitting directly above the first three says what was supposed to
  happen - *"a reload must not hand a dying hand a fresh candle - nor a
  captain who left one a clean name"* - and the code did exactly that. In
  practice: an engineer on the hull vanished on load, anybody adrift on a
  beacon dropped out of the world along with their rescue, **a captain who
  got somebody killed reloaded with a clean name**, and an item you had owned
  and sold fell out of your reference. Found by `tools/audit-saves.cjs`,
  which reads every `G.<field> =` in the source against what the slot stores
  and what it restores.
- **A JUMP STOPPED THE CLOCK ON SOMEBODY'S AIR.** The oxygen candle burns by
  `dt`, so it only burns where something hands it a `dt`. A slipspace
  transit does not advance the clock a frame at a time - it crosses the whole
  interval in one assignment - and nothing handed that interval to
  `Outside.step`. So anyone on the hull or adrift came out of a jump with
  exactly the candle they went in with. Measured on kawartha in a Talon:
  **643 of 660 real jumps - 97% - are longer than the twelve-hour candle**,
  median 31.2 h. Stranding somebody and jumping away was therefore free,
  which is the one outcome that module exists to prevent. A transit now burns
  its own interval, with the pickup check suppressed because nobody is
  collected out of a tunnel. The invariant, and the test: **equal intervals,
  equal outcomes** - thirty hours is thirty hours however the clock got there.
- **ONE BARREN ROCK COULD BUY A FACTION'S GOODWILL OUTRIGHT.** The frontier
  nod fired on every successful publish while its cap counted per faction,
  and a barren world costs nothing in Guild standing. So the cheapest
  goodwill in the game was one rock surveyed a little at a time and sold over
  and over: measured at **8,330 cr and 15 nods against 8,340 cr and 1** for
  the same ground sold whole - the entire designed cap, for the price of one
  sheet. The nod is recorded per world now, and that record is saved, so a
  reload is not a way round it either. The credits were never the exploit:
  the price is the difference of two curves, so slicing a sheet is worth what
  selling it whole is worth, to within rounding.
- **ONE TRADE-IN RATE, NAMED ONCE.** Three places computed the credit for
  your old hull as `price * 0.7` beside a `TRADE_IN` constant that is 0.7.
  Nothing was wrong today, but retuning it would have moved the large-hull
  path and silently left the small and medium one behind - with the yard card
  quoting one figure and the sale charging another.
- **A TEST THAT GREPPED FOR A LINE.** The three reload checks in
  `outside.test.js` read `save.js` as text and asserted only that each field
  was *written*. All three passed for a day while `load()` read none of them
  back. That is how the first fault above survived a green suite, and it is
  worth saying plainly: a test that searches the source for a line cannot
  tell you the line does anything.

#### And then the suite itself, which turned out to be the worse half

The hunt started in the new systems and ended in the thing that was
supposed to be watching them. `test/render.test.js` **has not finished a run
in some time, and did not finish one in the 1.5.0 release commit** - verified
by running it against a clean worktree of HEAD, where it fails and dies
identically with none of today's work in it.

- **IT WAS RED, AND IT SHIPPED RED.** `a drag pans the chart` asserted the
  gesture the chart had before 1.4.0 made the galaxy a solid you can turn.
  Panning moved to shift-drag and right-drag then - the chart says so in its
  own help line, and `chartPointer` decides which gesture it is at the press
  and holds it for the whole drag, deliberately. The code was right and the
  test was stale, so the test moved: a plain drag is checked to turn and not
  pan, shift-drag to pan and not turn, and the pan is checked first, while
  the chart is still square on, because once it is turned the direction a
  pan moves the view in is a function of the yaw.
- **AND IT DIED HALFWAY, TAKING 111 CHECKS WITH IT.** `openOptions()` opened
  the pause menu and pressed ArrowDown exactly three times, Options being the
  fourth row. `menuItems()` splices an extra row in at index 1 for a career
  that has not chosen its ship yet, which moves Options to the fifth: three
  downs opened Load game, `G.menu` was left on the wrong page, and the next
  line threw on null. **Everything after that point in the file - a hundred
  and eleven `check()` calls - has simply not been running.** It finds the
  row rather than counting to it now, and returns whether it got there so a
  caller fails a check instead of dying. A test that crashes takes every test
  after it down in silence, which is the failure mode that hid all of this.
- **AND ONCE IT RAN TO THE END, IT WAS PRINTING THIRTY STACK TRACES A RUN.**
  The ground-port sweep installs a stand-in `GLWorld` that says yes to
  everything and draws nothing - the right default, except that main.js draws
  the weather over the outside view every frame and `weather.js` asks GLWorld
  for the body's spin and then reads `sp.ax`. The stub answered `false`, so
  `rotAbout` got an undefined axis and threw. The harness catches and prints
  those rather than failing them, so the suite stayed green while its output
  filled with stack traces - which is exactly where a real one would hide.
  The real `spinOf` was already loaded in that block, so the stub uses it.
  **Not a fault in the game**: with a real GLWorld the path is sound.

`test/render.test.js` now runs to its end: **1,144 checks, all green, no
throws.** The three faults above are each small; what they add up to is a
suite that was reporting on about seven eighths of itself.

**What the hunt cleared.** Determinism holds across all the new modules - no
`Math.random`, no `Date.now`, every stream named and derived. An old
pre-November career was run against every new module's entry points: 23
survived, and the single throw was the probe calling a function that does not
exist. Capital placement uses 2D distance in a disc that is now 18 thick,
which looked like a bug and is not: capitals sit at **0.86x** the typical
star's height off the plane, so they are no more on-plane than anything else
is. And the hull reprice was swept for everything that derives a number from
it - every consumer scales proportionally, as intended.

- **Saves:** **improved, and no epoch bump.** All of this is additive. Saves
  already on disk start restoring the four lost fields correctly the moment
  you load them - nothing is discarded and no career is reset. A career that
  published sheets before today carries no record of which worlds already
  nodded, so each of them may extend somebody once more, bounded by the same
  cap it was always bounded by.
- **Tests:** a new `test/saveroundtrip.test.js` (33 checks) - `save.js` had
  **no test of its own**, which is the root of how four fields went missing.
  Its first test is deliberately not a list of those four: it walks the real
  payload key by key and insists each one lands back on `G`, with two named
  exemptions, so a field saved without a line to read it back fails the day
  it is added. `test/outside.test.js` grows to 65 and `test/charts.test.js`
  to 74, and `test/render.test.js` finishes for the first time in a
  while at 1,144. New tools: `tools/audit-saves.cjs`,
  `tools/probe-boot.js`.

### Added (2026-11-14, the ports, drawn)

- **EVERY PORT PATTERN HAS ITS PICTURE** on the wiki’s PORTS tab: a proper
  isometric of the real model, turned 45° and looked down at 35.264°, the
  angle where all three axes foreshorten alike. Fourteen patterns, each one
  recognisable at a glance — the drum with its arms, the ring’s wheel, the
  yard’s two rows of berths, a landing field with its cargo stacked on it.

**IT STARTED AS A TURNING MODEL AND THAT WAS THE WRONG ANSWER.** An item icon
turns in its card and nobody notices, because a gun is a few hundred
triangles. A station is not: measured off the library, the shells run 9,143
faces (a comet works) to 89,316 (a cradle station). Cut to 4,200 and painted
every frame, one thumbnail measured **16 to 19 ms a frame** — the whole of a
60 Hz budget, on the dev machine rather than on the Crawler this game is
built for.

Astra’s answer was better than tuning that number down: *"maybe just do an
isometric projection of the ports?"* **A still is painted once into a canvas
of its own and copied from then on** — the same trick the market rows
already use — so the budget stops being a frame-rate question:

- **0.00 ms a frame**, measured, against 16–19 before.
- And because the cost is one-off, the budget went **4,200 — 14,000 faces**:
  more than three times the detail for none of the running cost. At 2,600 a
  shipyard came out as floating boxes, because a yard IS berth blocks on an
  open frame and the frame is thin beams of small area — area-ranking cut
  exactly the structure holding the picture together.
- The one-off is 23–280 ms the first time a card is opened, nearly all of it
  the geometry fetch that was already happening there.

**And it is the right register for a reference page.** A reader comparing a
ring against a spine wants them shot from the same angle; a still is the only
way to promise that.

### Fixed (2026-11-14, three things wrong with the first picture)

- **Every station was framed off-centre, some barely on the card at all.** A
  PortLib model is not built around its origin — a drum station’s sits 146
  units off down z, because in the live world a port is placed by its dock
  point rather than its middle. Pointing a portrait camera at the origin
  therefore framed the empty space beside the station. The portrait mesh is
  centred on its own bounding box when it is cut, and the suite checks all
  fourteen sit on the origin.
- **A shipyard came out a smudge in the middle of an empty card.** The camera
  was placed against the bounding radius, and a yard’s extent is set by a few
  long outrigger beams: framing to those frames mostly nothing. It is placed
  against a **90th-percentile radius** now, so the body of the station decides
  the shot and a handful of spars are allowed off the edge — which is what a
  photographer would do with the same subject.
- **Every station came out very nearly black.** The sun was written down as a
  fixed vector and sat behind the subject. It is worked out from the camera’s
  own angle now, the same relationship the item portraits use, so the page is
  lit one way throughout.

- **Saves:** unaffected. A picture.
- **Tests:** `test/lore.test.js` grows to 46 checks — every pattern draws,
  none exceeds the budget, all fourteen are centred, decimation keeps the
  largest faces and re-indexes cleanly, `portraitReach` ignores the outermost
  tenth, and the angles really are isometric. `tools/probe-portmodels.js`
  photographs all fourteen in the running game and times the frame.

---

## 1.5.0 "Icosahedron" (2026-11-14)

Twenty faces, one solid — which is the release. **The game can now explain
itself**: every hull, fitting, cargo, station module, world type, star class,
government, port pattern and faction is written down in one place a player
can read without leaving the cockpit. 189 entries over twelve tabs.

The naming convention changed with this one. The names were pigeons from the
rescue through 1.3.1 "Clementine"; 1.4.0 "Dodecahedron" looked like a one-off
break and turned out to be the first of a new series (Astra, 2026-11-14:
*"our new naming convention is polytopes"*).

> ### Saves survive.
>
> No version bump — nothing stored changed. The wiki stores nothing at all
> (every entry is a pure function of the tables, the galaxy and what the
> career has already charted), and the hull reprice moves a price list rather
> than a save field. A career from 1.4.0 loads and finds its ships dearer and
> a reference page where there was none.

### Added (2026-11-13, the wiki: factions, ports and what a Terran world is)

Astra: *"a kind of wiki style game encyclopedia with ship hulls, factions
(as generated per seed), cargo items and equipment, as well as the
descriptions of all relevant types. The ports should also be demonstrated in
our game wiki thing."* (`src/lore.js`, new.)

The catalogue already held four of those — hulls, equipment, trade goods and
station modules. **Three new tabs** finish it, and they are a different shape
of thing: a government has no price and a faction is not something you can
own. Same house rule throughout, though: **read from the live tables, never a
copy**. Add a government to `Gen.GOVERNMENTS` and it is in the wiki with its
numbers.

- **TYPES** — all nine world types, five star classes and eleven governments.
  A world carries the generator’s own density, albedo and **air**: surface
  density against Earth’s 1.225, scale height, how much of the sky is cloud,
  and the one line a pilot actually wants — *wants a heat shield*, *thin air;
  the drive does most of it*, or *effectively vacuum*. A null entry in
  `Gen.ATMOSPHERES` is genuine airlessness and says so rather than inventing a
  number. Governments carry **both axes**, violence and corruption, because
  the one number the rest of the game reads is a function of the two.
- **PORTS** — the **fourteen patterns** every port in every seed is built to,
  told apart from the library’s own keys. Each says where it is built, which
  of the three sizes and three liveries exist, how many metres across it is,
  and how many berths — of which how many take a large hull.
- **FACTIONS** — this seed’s actual powers: their kind, whose space they
  operate inside, their capital, who they are at odds with and where you
  stand with them.

**NO PORT LAYOUT DRAWING.** The first cut drew a berth plan off each model’s
own anchors; Astra looked at it and scrapped it the same evening (*"scrap the
port layouts for the game wiki thing"*). **The berth counts stay** — how many
a pattern has, and how many take a large hull, are what a pilot looking this
up actually wants — and `berthPlan` went out with the drawing rather than
being left in place against a future that may not come. *(A turning model is
still the open question for this tab.)*

**WHAT THE WIKI IS ALLOWED TO TELL YOU.** Astra’s call, asked before any of
it was built: **types always, specifics once met.** The game SELLS slipspace
charts — whose flag flies over the systems around a port, at 85 cr a star and
rising with distance — so a page listing every faction’s territory to a
brand-new career would be giving away the thing the chart seller is holding.

- A reader can **always** look up what a Charter is, what an outlaw band is,
  how a Syndicate differs from a government, and every world, star and port
  type. A fresh career opens FACTIONS to the four **kinds** of power and none
  of this seed’s ten named ones.
- The named ones fill in **behind** the purchase: charting or visiting a
  system introduces whoever holds it, and standing with somebody counts too,
  because a power that has dealt with you has introduced itself. Measured on
  kawartha: 0 of 10 on a new career, 7 of 10 after charting eighty stars.
- **Meeting them is not the same as knowing where they live.** A faction you
  have standing with but whose space you have never charted shows its capital
  as *not on your charts yet*, and the systems count says *buy the local
  sheets to fill this in*.
- **One gate, one function** (`Lore.knownFactions`). A gate in one place can
  be audited; a gate in nine cannot.

**THE LINKS ARE CLICKABLE,** which is what makes it a wiki rather than a list.
A faction names its kind and the power it operates inside, and both are rows
you can click to go there — tab and all.

- **Resolved against the live tab list**, never a stored index. The FACTIONS
  tab GROWS as the player charts, so an index cached when the card was drawn
  would quietly point at the wrong row a few systems later.
- **A link to a power you have not met does not appear.** Standing with a
  minor power introduces THEM, not their host, and a host link on that card
  would be the gate leaking out through the back door. The suite checks
  exactly that, and checks that with the whole galaxy charted no link dangles.
- A target that is not on the page is drawn dim and does nothing, rather than
  being a live row that goes nowhere.

- **Reading the wiki cannot change a save.** The suite checks the source for
  an RNG call and for any write to `G`, because a reference page that touches
  the world is not a reference page.
- **Saves:** unaffected. Nothing is stored; every entry is a pure function of
  the tables, the galaxy and what the career has already charted.
- **Tests:** `test/lore.test.js` (37 checks, `economy` group beside the
  catalogue’s own); `tools/probe-wiki.js` opens the page in the running game,
  photographs a port plan and watches the roster fill in as stars are
  charted.

### Fixed (2026-11-13, two things the first draw got wrong)

- **"NaN cr" down the whole of every new tab.** The list column printed
  `fmtCredits(undefined)` for things that have no price. It carries what the
  entry IS instead — *star*, *world type*, *government* — which is the useful
  fact for something you cannot buy.
- **The berth plan drew a circle through a grid.** The guide ring assumed
  berths ring a structure. A shipyard’s ten do not, and a circle drawn
  through a grid is not a neutral guide — it is a claim about the shape of
  the station that the model flatly contradicts. It is a box round the berths
  now, which claims only what is true: this is how far they spread.
- **A flat square told the reader nothing.** World types and stars had the
  same blank swatch as everything else. A world is a lit ball now and a star
  a glowing disc, both in the generator’s own colours, so retinting a type in
  the tables retints it here. A faction keeps the flat square, because a flag
  colour genuinely is a flat colour.

### Changed (2026-11-13, a bit more expensive)

- **EVERY HULL IS 25% DEARER.** Astra, from the original rebalance: *"make
  all ships a bit more expensive."* A Talon goes 32,000 — **40,000**, a
  Kestrel 150,000 — **188,000**, a Leviathan 780,000 — **975,000**, the
  carrier 18M — **22.5M**. Rounded to a step that suits the magnitude,
  because a price list wants reading at a glance.
- **Uniform, and uniform is the point.** Trade-in and resale are fractions of
  price, so an upgrade from one hull to the next costs 25% more rather than
  becoming disproportionately cheap or dear, and the shape of the ladder is
  exactly what it was. What changes is the one thing meant to: every rung now
  costs more of the income that buys it, and mission pay did not move.
- **The opening purse was measured, not assumed.** `start.js` computes a
  start rather than writing it down — every focus at a difficulty is worth
  the dearest focus’s kit plus a fixed floor, and your cash is that total
  less your own kit. I expected the rise to cancel out. It does for the
  dearest-kit focus (easy/trade and normal/mining are unchanged to the
  credit) but not for the others, which pocket the difference between their
  hull’s rise and the dearest hull’s: **easy/combat +13,000, easy/mining
  +10,000, normal/trade +3,000, normal/combat −1,000.**
  - The invariant `start.js` exists to protect still holds exactly — every
    focus at a difficulty totals the same (easy 166,800, normal 82,400), so
    no start became richer than another. Each start is worth about 25% more
    in total, which is the same wealth measured in dearer ships.
  - It cannot be cancelled by lowering the floors: the dearest-kit focus is
    already sitting exactly on its floor, so the floor would have to go
    negative. Say the word if the starts should be pinned to their old cash
    instead and the starting hulls left at the old prices.

- **The Cartographers are twice as quick to warm to you.** 12,000 cr of sheet
  per point of standing → **6,000**, so **one good frontier world charted end
  to end is about one point** rather than half of one. At the old rate a
  career could file real work and still read zero, which is not a
  relationship you can feel yourself building. Still a running ledger rather
  than a per-sale rate, so the median world’s 340 cr is not lost to rounding.

### Fixed (2026-11-13, one fact, one place)

- **A craft’s price was typed out twice.** `construction.js` kept its own
  copy of the Bollard’s, Wren’s, heavy shuttle’s and heavy tug’s prices
  beside the hull they name, with a test standing guard over the two copies
  — and the guard duly went off the moment the hulls were repriced. The
  test did its job, but **a fact that needs a guard is a fact stored in the
  wrong number of places**: a craft’s price now resolves from `Combat.HULLS`
  when it is read, so the two cannot disagree. Lazily, so it is right
  whichever module a test requires first.
  - `size` is left written out. It did not drift, and a craft’s size is a
    fact about which pad it takes in the Crawler’s bay rather than about the
    hull. The test still checks the two agree, which is the right
    relationship for a number that is genuinely its own.
- **Two more tests pinning a number where they meant to protect arithmetic.**
  The Crawler’s refit costs were checked against 44,000 and 18,000 written
  out in the test — the old Bollard and Wren prices — so both failed over a
  formula that had not changed. Now priced off the live table. **That is the
  fifth test this week** failing because it pinned a figure rather than the
  behaviour the figure happened to produce.

---

## 1.4.0 "Dodecahedron" (2026-11-13)

Not a pigeon. Astra: *"a break from the bird names; but that’s okay"* — and
a dodecahedron is the right thing to name it after, because this is the
release where the galaxy stopped being a sheet of paper and became a solid.

> ### Saves do not survive this one.
>
> **Save VERSION 5 — 6 (epoch 6).** The cluster was redrawn with real
> thickness, so every seed grows a different arrangement of stars. A career
> from 1.3.1 is sitting in a system whose neighbours, jump distances and fuel
> costs have all moved. A version bump does not migrate a save, it discards
> it — which is the honest outcome here, because the alternative is a career
> that loads into coordinates that no longer mean what they meant. Astra
> chose this knowingly: *"we can break existing saves."*
>
> The deprecation shelf was empty, so nothing else goes with the bump.

### Changed (2026-11-13, the galaxy got thicker)

- **THE CLUSTER IS 18 LY OF HALF-HEIGHT, NOT 7.** It was a 72.75 ly disc
  7 ly thick — about **10:1**, which is a sheet of paper rather than a
  cluster. Every star has always carried a z and the chart threw it away, so
  nothing in the game ever had to ask whether the third axis was worth
  having. The moment the chart could be turned it was plain there was
  nothing out there to see.
- **At 18 the cluster reads 4.1:1.** Measured on kawartha: median |z| 5.33 ly,
  p95 14.88, max 17.57 against a 72.56 ly radius. **Two stars in three now
  have a genuinely three-dimensional nearest neighbour** rather than one that
  only looked nearest in a flat projection — which is the thing that makes
  rotating the chart a navigational act rather than a toy.
- **The median jump is 36% longer.** That is the cost, and it is the reason
  this was a decision rather than a tweak: range matters more, fuel matters
  more, and a hull that could just reach the next system may no longer.
  Swept over seven values before the number was picked.
- It is one constant, `CLUSTER_THICKNESS`, and `Galaxy.build` already took an
  override for it so the sweep never had to edit the file.

### Added (2026-11-13, the Cartographers, and what a dead rock is worth)

Astra: *"Maybe we should have a cartographer’s guild? For the survey
stuff?"* And then, correcting the first design I put up: *"I don’t think
that the mining guild would have a problem if you publish a survey of a
world that is of zero interest to them."* And: *"All factions should be
trying to expand outward."* (`src/charts.js`, new.)

**ONE SURVEY FLIGHT MAKES TWO DIFFERENT GOODS, and until today the game
only bought one of them.**

- **THE ASSAY** is what is in the ground. The Mining Guild has always
  bought it, priced on the ore, and it goes stale. A barren world’s assay
  is worth nothing, correctly: there is nothing in it they want.
- **THE SHEET** is the chart — where the world is, what the surface does,
  where a hull can be put down. **The Cartographers buy that, and a world
  with no ore at all has one.** That was the hole: you could spend a day
  mapping a dead rock on the frontier and the game had no way to pay you.

The two are priced on nearly opposite things, which is the point. A
bonanza world in a capital’s own system is a fat assay and a worthless
sheet — everybody has that sheet. A barren rock eleven light years past
the last flag is the reverse. Measured over 8,386 worlds: **on 28% of them
the sheet pays more than the assay, and on 13% there is nothing worth
digging at all and the chart still pays.**

- **Novelty is most of the price**, and it comes from two things the galaxy
  already knew: whose writ runs here (`Galaxy.control`) and whether anybody
  has built a berth. They compound rather than one winning, so a system
  with a flag *and* a port is better known than one with either.
- **Reach is the rest.** Distance to the nearest capital of anybody, over
  the cluster radius. This is the term that makes expanding outward pay,
  and it is the mechanical form of Astra’s line about the factions.
- **Coverage counts steeply** — half the ground is well under half the
  money, because half a chart does not let anyone plan a descent. Below
  15% of a world there is no sheet to sell, and the row says so.
- **A SHEET DOES NOT GO OFF.** The assay halves every 180 days because ore
  gets dug and markets move. A chart has no decay at all, and that is not
  generosity, it is the physics the rest of the game already runs on: the
  rotations change, the orbit does not. `Charts.value` takes no clock
  argument, so there is no route by which age could reach it.

**PUBLISHING IS A SEPARATE ACT, AND THAT IS THE WHOLE DECISION.** Selling
the Guild an assay is private — they file it. Publishing a sheet puts the
world in the public record, which is what the Cartographers are paying for.

- On a world of no interest to anybody’s mining concern that is free money
  and there is nothing to decide. **On a world with real deposits the sheet
  is a signpost on somebody’s quiet rock, and prospectors follow charts.**
  So publishing costs you with the Mining Guild in proportion to what is
  actually down there: **nothing on three worlds in four, and up to −4 on
  the real prizes** (23 worlds of 8,386 are minded about in full).
- Note what the Guild is *not* objecting to. You have not leaked their
  assay. You have told the galaxy the place exists and can be landed on —
  which is why the grievance scales with the ore and not with your
  coverage, and why a barren world costs exactly zero. Astra’s correction,
  made mechanical.
- **The row warns you before you press it**: *"Mirven I a at 100% — 620 cr
  — the Guild will mind (−3)"*. A cost you find out about afterwards is not
  a decision.
- **One world at a time**, on the F4 deck list directly under the assay row.
  The nav lock picks the world, else the best-paying sheet here — the same
  rule the claim row follows. A desk that published the lot in one click
  would be taking the decision for you.
- **Published is published.** The edition is written onto the survey record
  itself, so the same ground is never paid for twice and a reload cannot
  launder it. Map more of the world later and you can publish the
  extension, paid for the new ground only: the two halves come to the
  whole-world price.

**AND THE FACTIONS NOTICE.** A sheet of a world out past the flags extends
somebody’s reach whether they asked or not, so publishing one earns **+1
with whoever’s capital is nearest** — a lawful power, never the Syndicate.
Capped at 15 a side, because charting is not a career with a government.

**THE BOOKS.** The Cartographers credit **one point per 12,000 cr of sheet,
capped at five a filing** — and unlike the Guild’s, theirs is a running
ledger rather than a per-sale rate, so a hundred small sheets are worth one
big one and nothing is lost to rounding. They sit under the Mining Guild on
the F7 standing list, and because a career can have filed real work and
still read zero, the row carries what is in the ledger but not yet a point:
*"neutral (0)    9.7k to the next"*. **A Guild you have spent now paints
red**, which nothing else in the game could make it do.

- **Saves:** additive, **no version bump**. `carto` (what they have paid you
  and which powers charting has pleased) joins the store; the per-sheet
  record of what is published rides on the survey record, which was already
  saved field by field. An older career has published nothing, which is
  exactly true.
- **Nothing here draws from the seed.** Every input is a pure function of
  the immutable galaxy or of a body the generator already made, so this file
  cannot move a star, a world or a deposit. The suite checks the source for
  an RNG call and checks that publishing leaves the assay worth precisely
  what it was worth before.
- **Tests:** `test/charts.test.js` (68 checks, `ground` group), cast against
  the real kawartha galaxy rather than fixtures. `tools/measure-charts.cjs`
  is the census the numbers came from; `tools/probe-charts.js` docks at a
  real desk in the running game, reads the row, publishes a barren world and
  a rich one, and photographs the F7 list going red.

### Fixed (2026-11-13, found by measuring before tuning)

Four faults in the first cut of `charts.js`, every one of them found by the
census rather than by the unit tests — which is the argument for writing the
census first.

- **Nobody ever minded about anything.** The thresholds for the Guild’s
  grievance were set by arithmetic on a guess, at 900 and 7,000. The real
  distribution of ore interest over 8,386 worlds runs min 11, median 64,
  p95 359, **max 992** — so the floor sat above the entire galaxy and every
  world in the game was free to publish. Astra’s distinction did not exist.
  Now 200 and 650, measured.
- **Novelty was bimodal: 0.05 or 1.0, with nothing in between.** Port count
  added a flat 0.16 each, and with systems holding up to eighteen berths,
  every busy system pinned at the ceiling. A premium nobody can feel is not
  a premium. It saturates now — the twelfth port means very little more
  than the sixth.
- **Every world in the galaxy measured exactly one Earth.** `sizeOf` read
  `target.rad`; a body’s radius field is `target.radius`, so the term read
  undefined, fell to the reference, and did nothing at all. 8,386 worlds
  with an identical size factor is the sort of thing a unit test happily
  agrees with and a histogram cannot hide.
- **The top sheet in the galaxy paid 20,570 cr** — a *barren* rim gas giant
  matching the richest assay anywhere, with a whole system of them behind
  it. The balance rule is that a survey pays well and never beats active
  hauling. A fully mapped Earth on the far rim is now about 4,700 and the
  best sheet anywhere about 8,400, against the 16,000 a fully mapped rich
  world’s assay pays.

And one the suite caught on its own:

- **`SIZE_LO` was a floor that could never bind.** `clamp(0.6 + 0.4 * x,
  0.6, ...)` with x never negative: the clamp was dead code dressed as a
  constant. Rewritten so the constant is the intercept and means what it
  says. A number in the source that cannot do anything is a lie about how
  the thing works.

### Added (2026-11-13, the gravimeters have faces now)

- **ALL FOUR GRAVIMETER RUNGS HAVE THEIR OWN MODEL** (Astra’s art). They
  shipped on the 12th with no icon at all, which was the one red line in the
  suite: `guns.test.js` checks that every item of equipment has something to
  turn in its card, and named all four.
- **Four distinct models, not one with a fallback.** `Render.itemKey` falls a
  higher rung back to tier I’s art when it has none of its own, so one file
  would have cleared the check — but each grade now has its own, and the
  catalogue shows a different instrument as you climb the ladder rather than
  the same box four times.
- They arrived named `eq_gravimeter1..4` and went in as **`eq_gravI..IV`**,
  because `src/itemmodels.js` is keyed by file stem against the equipment id
  and the ids are `gravI..gravIV`. A model whose name does not match its item
  is a model nothing will ever ask for.
- **Saves:** unaffected. Art only; nothing about a fitting is stored.

### Added (2026-11-13, a chart you can lean over)

- **THE GALAXY MAP TURNS.** The star chart was always three-dimensional data
  drawn flat: every star has always had a z, and the camera threw it away.
  The view now carries a yaw and an elevation and the chart is drawn through
  a camera (`chartCam`, `chartProj`, `chartUnproj` in `src/screens.js`).
  **Drag with the mouse to turn it**; shift-drag or right-drag still pans,
  decided once at the press so a drag never changes its mind halfway.
  **L** snaps back to the plan view you had yesterday, straight down with
  north up.

- **A STEM TO THE FLOOR, SO THAT HEIGHT READS.** Every star drops a hairline
  to the z = 0 plane. Without it a tilted chart is ambiguous — a star drawn
  high on the screen could be above the disc or merely far across it — and
  with it the eye takes the height off the stem the way it takes a bar off an
  axis. Reach circles tilt with the disc and project as ellipses, which is
  what a circle on the galactic plane actually looks like from an angle.

- **K EXAGGERATES DEPTH** through 1×, 2×, 3× and 5×. The cluster is a thin thing,
  so at true scale a tilt barely shows. The multiplier stretches the z axis
  **on the display only**: it changes nothing about where a star is, what a
  jump costs, or what the seed grows. It is a lens over the map, not an edit
  to it.

- **The camera is remembered per chart**, so yaw, elevation, zoom, pan and the
  depth multiplier all survive leaving the screen and coming back.

### Fixed (2026-11-13, the chart’s third pass)

- **Zooming on a turned chart drifted 6.7 ly.** `chartZoomAt` still assumed
  the old flat projection, so zooming toward the cursor on a tilted view
  walked the point under the cursor away from itself. It now solves for the
  centre in the view plane and unprojects back to the galaxy: **1.9e-14 ly**,
  which is double precision saying zero. (`test/galaxyzoom.test.js`, 31
  checks.)

- **The planetary scanner’s header advertised keys the screen had lost.** A
  second, stale copy of `scannerKey` further down `src/screens.js` shadowed
  the real one, so S, T, the zoom keys, the arrows and D all silently did
  nothing while the header listed every one of them. The stale copy is gone.

### Added (2026-11-13, somebody on the hull, and a captain who took my crew)

- **EVA REPAIRS — the only in-flight repair in the game** (`src/outside.js`,
  `test/outside.test.js`, 52 checks). A yard charges 9 cr a hull point and
  needs you docked; an engineer on a line charges nothing and needs you
  drifting. A rating-3 hand mends about 11 hull an hour off the line, 6 on
  it. Refused from a berth, from the ground, without an engineer aboard, on
  a sound hull, and on one so far gone it is a yard job — and the refusal
  says which.

- **THE TETHER IS THE WHOLE DECISION.** Clipped on, a burn drags them along.
  Clipped off, they reach more of the hull — and if you light the engine
  they are not coming with you. They keep the velocity they were cast off
  at, so they fall behind rather than vanishing.

- **TWELVE HOURS OF AIR, AND A BEACON WITH YOUR SHIP'S NAME ON IT.** The
  candle runs on the sim clock, so time warp is the thing that kills them.
  The beacon carries the ship's name and registration, which is the whole
  reason leaving somebody costs anything. A hand adrift shows at the top of
  the nav list under the distress mark — the one mark allowed to shout —
  with their air where the range usually goes.

- **FLYING TO THEM IS PICKING THEM UP.** No button: at the moment you are
  finally alongside somebody you nearly killed, hunting for a control is the
  wrong thing to be doing. Within 350 m with the engine cold and they are
  aboard. Not while it is lit — you do not collect a person at speed.

- **LEAVING THEM IS NOT A BOUNTY, BECAUSE NOBODY SAW IT.** It costs the only
  thing it can: hands will not sign with you. One death and the good ones
  start saying no (the hall's rating ceiling drops to 3), the rest want
  about 38% more to sign, and there are fewer berths on the board. A habit
  of it and the ceiling falls to 2 with *"They know what you did."* The
  hiring draw is untouched, so this removes people rather than replacing
  them — the same hall, minus those who will not have you. Going back
  promptly costs nothing; going back with hours to spare costs a little.

- **Shooting somebody in a suit is now the heaviest killing in the game**
  (`killSuited` 16,000, above the rescue tender's 14,000). The tender at
  least has a hull. A person on a beacon has a visor, and the only thing
  between them and you is that everybody agreed not to.

- **HIRING A HAND OFF SOMEBODY'S SHIP NOW MAKES AN ENEMY**
  (`test/poaching.test.js`, 14 checks). It lands on the **captain**, not
  the hand — the hand is pleased; it is the captain who sails short next
  run. **-4** on her feeling: worse than lying to her about your cargo
  (-2), not as bad as holing her hull (-5). No honesty hit, because you
  outbid her rather than deceiving her. She greets you with it by name
  ("You took {who} off my ship"), and captains.js spreads it to her friend
  and her rival on its own.

### Fixed (2026-11-13, the second pass)

- **The air warning fired on state rather than on crossing**, so under time
  warp — where a single step is hours long — the step that should have
  warned you jumped from six hours of air straight to dead. **No warning at
  all, in exactly the case where warp is what kills them.** Every threshold
  a step passes over now fires, so the warp that kills them is also the warp
  that tells you.

- **A new captain-memory tag with no row in the TAGS table threw.**
  `TAGS[ev.tag].rank` on a tag that was not there would have crashed the
  first time you poached from a captain you had already traded with — an
  ordinary path. Caught by the test before it shipped.

### Changed (2026-11-13, a contract has a clock, and a hull has room for the kit)

- **DELIVERING AT THE LAST POSSIBLE MOMENT NOW COSTS STANDING.** Past 70% of
  the window you signed for, arriving starts to cost, rising to the full
  figure at the deadline: up to **3** for freight, which cancels what the job
  earned, and up to **6** with people aboard, which is nearly what failing
  outright costs — because they were sitting in a cabin the whole time and
  they say so at the desk.
  - **The clock runs from when YOU signed**, not from when the offer was
    posted. Taking a contract late in its own window and flying it at once is
    not the same sin as taking one fresh and forgetting about it.
  - Deliberately generous: most windows are days wide for trips that take
    hours, so 70% of one is not "a bit slow", it is a contract you forgot. A
    pilot who flies the job when he takes it will never see this.
  - Contracts signed before today carry no timestamp and read as **timely**,
    so loading an old save fines nobody.
  - The exploit originally described — padding distance to run the clock —
    was checked and cannot pay: a fee is fixed when the offer is written,
    from the direct leg at the window opening, and never reads where you
    actually flew.

- **MORE ACCESSORY SLOTS: +1 on S and M hulls, +2 on L and XL.** The
  gravimeter broke the utility budget the morning it landed — a Talon carries
  a survey scanner and a magnetometer and that is both her slots gone, so the
  new instrument did not fit on the starting ship at all. Measured over all
  23 hulls: the surveyor's kit could be flown by **12 of 23**, the full
  prospector's outfit by **6**. Now 18 and 16. The Talon goes 2 → 3 and can
  take survey work; the big haulers become proper survey platforms.

- **The top two grades of each instrument are hungry.** Before this, *nothing
  but the slot count* limited a utility loadout: the whole surveyor's kit is
  2.9 MW against a Wren Shuttle's 4 MW cap, so every hull in the game could
  already afford every instrument, and adding slots alone would have handed
  the kit out free. Grades 1 and 2 are instruments a courier hangs off her
  bus and are unchanged; grades 3 and 4 are a cold baseline and a cloud of
  falling atoms, and now draw like it.
  - Deep survey array 2.0 → **6.0 MW**, shielded deep array 2.4 → **7.0**,
    cryogenic gradiometer 1.3 → **4.0**, atom interferometer 1.8 → **6.0**.
  - A Talon can fly the grade-2 surveyor's kit outright, and the grade-3 kit
    only with an auxiliary reactor in an internal slot. That is the trade.
  - Nothing breaks on an old save: a ship over budget browns out — guns
    cycle slow, and the SHIP page says **OVER — guns slow** in red — and a
    field sweep takes longer rather than failing.

### Fixed (2026-11-13)

- `test/combat.test.js` pinned the Talon's slot count at nine and the drive
  and slipspace bays at positions 7 and 8. The invariant it exists to protect
  is that those two come **last**, so that adding a slot in front moves no
  older key — which is precisely what happened, and the test failed for it.
  Rewritten against the invariant and against the hull's own table, so a hull
  retune cannot leave it lying.

- **And the same fault again, in another file.** `test/tradeanalyser.test.js`
  fitted a Talon with exactly three things and assumed that filled her, which
  was true while she had two utility slots. The bump gave her a third, so the
  analyser fitted and a check about trade analysers failed for a reason that
  has nothing to do with trade analysers. It now asks the hull how many slots
  there are and fills them. **Both failures were the same mistake made twice**
  — a test pinning a number when what it meant to protect was a behaviour —
  and the second one only surfaced when the `economy` group ran, which is the
  argument for running the whole suite rather than the group that looks
  relevant.

### Added (2026-11-12, the catalogue, the gravimeter and what is under the ground)

- **THE CATALOGUE (Shift+C)** — a reference page for every purchasable thing
  in the game, 141 entries over nine groups, each with its turning 3D icon,
  its numbers and its copy. Reached from the controls card (H) and from
  Options → REFERENCE. Astra: *"My wife wants a sort of gameopedia; and
  that's something I think players will want also."*
  - Read **from the live tables**, never a copy, so adding a gun to
    `Combat.GUNS` puts it in the book with nobody remembering to come back.
    Equipment numbers go through the yard's own `itemSpecs()`, so the
    catalogue cannot quietly disagree with the shop.
  - **No gates.** A market shows what this port stocks and what your standing
    and the local development allow, which is right for a market and useless
    for a reference.
  - **`unlisted` items stay out until you own one** (fitted, on a parked
    ship, or seen before). Three of them; a new career sees 138 of 141.
  - Hulls turn through `Render.drawHullPortrait`, everything else through
    `drawItemPortrait`, with the wireframe stand-in where no model exists.

- **GRAVIMETERS, four grades** (`gravI`..`gravIV`: Gravimeter 5,200 /
  Gravity gradiometer 12,400 / Cryogenic gradiometer 27,000 / Atom
  interferometer 58,000). Utility slot, one group. The one instrument that
  reads **through** rock: a spectrometer sees the surface, gravity does not
  care how deep a thing is buried. The grade buys **resolution**, not range —
  grade 1 tells you a hemisphere is heavy, grade 4 separates two bodies lying
  together and reads one that is dense for its size. Sensitivity is in
  **milligals**, absolute, so a grade means the same thing over a moon and
  over a world nine thousand kilometres across (450 / 220 / 70 / 12 mGal,
  set from 2,107 measured sources over 403 worlds).

- **THE GRAVITY SLICE** — a fourth layer on the planetary scanner (G, or the
  GRAVITY button), a cut through the middle of the world on a selectable
  **XY / YZ / ZX** plane (1 / 2 / 3). The well in blues, the ore anomaly in
  heat over it, the core boundary dashed, and every mass the instrument can
  pick out listed beside it with its depth, its size and what it would take
  to reach it. **g falls to zero at the centre** and peaks at the
  core-mantle boundary, because only the mass below you pulls — the profile
  integrates to the mass the body already has, so the slice can never
  disagree with the orbit it is flying.

- **DEPTH IS REAL, and it gates reachability.** Three bands of overburden:
  **shallow 0.2–4 km** (a drone or a pair of hands), **mid 4–30 km** (a
  drilling team), **deep 30–300 km** (visible as mass and nothing more).
  Every province that shows on the surface map is shallow, because something
  is already mining it. **Additive**: the surface ore map is byte-identical
  over 919 worlds (hash `34a51161` with and without). What is new is a
  second population that never touches it — 1,187 buried bodies on 650 of
  919 worlds, which no spectrometer at any grade can see.

- **Descriptions for 28 things that had none.** The 24 trade goods carried
  only an id, a name, a tier and a price; so did the three contraband goods
  and the four bay craft. One line each.

### Fixed (2026-11-12)

- **A second `scannerKey` was shadowing the real one.** `screens.js`
  declared the function twice, and in JavaScript the later declaration wins —
  so on the planetary scanner **S** (style), **T** (sweep), **+/-** and **z**
  (zoom), the **arrow keys** (pan) and **D** (deploy a drone) all silently
  did nothing, while the page's own header advertised every one of them. The
  stale five-key copy is gone.

- **`tools/item-models.cjs` would silently empty `itemmodels.js`.** The
  icon models are stored gzipped (`eq_foo.glb.gz`) but the packer only ever
  matched plain `.glb`, so running it against the repo as it stands found
  zero models and rewrote a 3.9 MB file down to 1 KB. It now reads either,
  prefers a loose export over the stored copy, and **refuses to write an
  empty file**.

- **Local passage fares** could be 680 cr for carrying two people between
  berths. Floored like the haul fees, unless the leg is a short hop.

- A fitting whose id ends in a Roman numeral now falls back to tier I's model
  until it has one of its own, so a new ladder does not need four pieces of
  art before it can ship.

### Added (2026-11-12, two hulls with an arrangement)

Astra: *"We're gonna need NPC ships to both trade with each other ... something that the player can come across in the local system chatter and attempt to render aid or even pirate their ship."* And, on how to seed it: *"why don't we build it on a seed which uses the last ship's ID that showed up in system before you, plus a time variant, plus the game seed?"*

**The arrangement is in the seed** (`attachRendezvous`, `src/generate.js`). Two hulls, out of two different berths and by preference two different flags, both somewhere else on the same afternoon: a long way out, around a body with no dock on it, holding station a few hundred to a few thousand kilometres apart for eight or ten hours, then going home. Same galaxy, same two ships, same rock, same hours, forever — because that is what an arrangement is. About a third of the systems that could support one have one.

**There is no new machinery in it, and that was a surprise.** I had this costed as a new rail type Sim would have to learn. It is not: a traffic route's endpoints resolve through `sys.byId`, which is any body and not only a port, and `trafficCore` already flies cruise out, long layover, cruise back on a period. Measured before a line of it was written: two routes to the same moon with the same `t0` put their hulls 2,300 km apart and **holding**. The engine has been able to fly a rendezvous all along. The pair goes in `patrols` rather than `traffic`, because a traffic route's arrivals are deliveries and the market reads them off the timetable — these two are not delivering anything to a moon.

**What moves on any given afternoon is Astra's seed**, and the last term is the good part: the galaxy, the system, the window, **and the hull that came in ahead of the window**. The ship that arrived before the meeting is the one who set it up, so "whose idea was this" is a thing you can go and look at on an arrivals board rather than a number the game kept to itself.

> **The one change I made to her design.** She had it as the last hull in before *you*. That is derivable — traffic is a closed-form function of the timetable and the clock — but keyed to your arrival it is a re-roll button: jump out, jump back, different last ship, different cargo, shop until the hold is worth stealing. It would also quietly break the thing this game is built on, which is that the same seed is the same universe; a meeting that changes because you blinked is not a fact about the world. So the last hull is taken **at the window's opening** rather than at your arrival. Re-entering during the same window gives the same meeting; you can still get a different one by waiting the window out, which costs days. A price rather than a re-roll, and the hook survives whole.

**Four things you can do about it**, and the fourth needed no code — watch, and do nothing, which is what anybody does the first time.

- **Ask what they are moving.** They will let it go at 55–78% of list, no paperwork and no berth fee, which is the whole reason they are out here.
- **Take it off them.** Two light freighters, matched, a long way from anybody: the best moment there will ever be to rob somebody, and exactly why they did not want to be found. It costs you 14 standing with **both** flags and the hold is hot.
- **Tell somebody.** The new verb. You are not taking anything and not buying anything; you are selling the fact that this happens, to a flag that would like it to stop. A third of list as a finder's fee, better than double that when what is moving is contraband — and they lie low for four meetings afterwards.
- Each shuts the other two for that window, and all of it is saved.

Measured so the choice is a real one rather than a trap: on clean cargo it is about **2,500 / 7,700 / 2,700** credits for buying, taking and telling; on contraband, about **14,300 / 43,500 / 33,500**. Taking it always pays most and always costs the most; telling needs no hold space and gains standing instead of losing it.

- **It goes on the open band** as a RENDEZVOUS, so you can hear about one you are too far away to reach — which is the point of the band.
- **Two numbers the measurements changed.** The first cut paid a finder's fee of **513 cr** for flying a day out and informing on two outfits, which is not a choice but a trap: the meetings were too small (six tonnes is a boot sale, not an arrangement) and the cut was priced like a tip. And two hulls *moored at the same body* are not necessarily alongside — the pose a ship gets off a body with no berths put some pairs **a third of a million kilometres apart**, which the probe found in the running game. The generator now asks Sim where the two of them would actually be, and only picks a body where they end up within 30,000 km. Across four galaxy seeds the tail at 112,000 km is gone and every pair sits inside 25,000.
- **Saves:** additive, **no version bump**.
- **Tests:** `test/rendezvous.test.js` (47 checks, `combat` group): it is in the seed and the same seed gives the same arrangement; the additive rule, with exactly two more hulls in the sky and every other one unchanged; they are alongside for the whole window and the meeting is *off* once they have gone home; the deal does not move inside a window and the next one is its own thing; and each of the three actions, including that an unarmed hull is not robbing anybody and that both of them work out who was alongside after you tell. `tools/probe-rendezvous.js` winds the clock to the hour, puts the ship between them and photographs the channel.

### Changed (2026-11-12, you can tell what a row is without reading it)

Astra: *"the ascii icons for the various places are difficult to recognize as what they are at a glance. Stations should be in bold or something, or an icon be made up that will fit beside them. Ships should be in grey if neutral, green if friendly and red if hostile. If unknown, the track shows up as white."*

Two changes on the F3 nav and F4 comms lists, doing different jobs.

**The mark says what it is, and it is drawn now rather than typed.** `*`, `O`, `o` and `#` are four marks that all read as "a small bright smudge" at twelve pixels in a column of forty rows. In their place: a ringed disc is a star, a filled disc a planet, a small one a moon, a **barred square a station**, a triangle on a ground line a pad on a world, a chevron a hull, a diamond an incident (filled while somebody is still asking, hollow once it is over), a ring with a dot in it a field contact, and a mast with two arcs a police channel — a frequency, not a place. You can tell them apart without reading them.

**The colour says whose it is, and only for hulls.** Grey is a hull with no opinion of you, green one whose flag thinks well of you (+10, where the standing words turn warm), red one that would shoot (hostile, or a flag at −40 where the law already shoots over it), and **white one you cannot read**: running dark, or flying no flag at all. White should be rare, and when it turns up it should be a question. Places keep their faction's colour, because whose dock it is matters more than whether they like you today.

- **A trader flies no flag of her own.** The first version came out of the probe reading **159 of 166 hulls in Mirven as "unknown"** — ordinary traffic carries no `faction` field at all, only the patrols do. A freighter is of the flag over the dock she sails from, which is what the port list, the customs officer and the raid news already assume. Fixed, and measured again: 164 neutral and 2 hostile on a fresh career, which is what grey-by-default should look like.
- Neutral grey is deliberately brighter than the game's disabled grey. A hull with no opinion of you is not an unavailable one.
- `tools/probe-marks.js` rigs one of each colour in the running game and photographs both lists.

### Added (2026-11-11, the open band: what is happening to somebody else)

Astra: *"We're gonna need NPC ships to both trade with each other and fight one another, something that the player can come across in the local system chatter and attempt to render aid or even pirate their ship."*

**The fighting was already built. What it had no way to do was reach you.** `aggression.js` has run NPC-on-NPC violence since October — pirates pick prey off the traffic timetable and run freighters down, Syndicate runners open fire without a word, customs cutters chase smugglers, rival empires' hulls shoot at each other — and the player's side of it has been wired the whole time: standing for driving a pirate off, for helping make a kill, for helping an arrest, and a penalty for interfering with one. But every line of it narrates through a `near()` check, so a robbery forty million kilometres away was completely silent. The only thing that ever told you it had happened was `raidNews`, on the dock, afterwards, as gossip. **You could not come across an event because you were never told there was one.**

So: **an emergency band** (`src/band.js`, new). Not the comms list — that is ships inside the transmitter's three quarters of an AU, and this is a different kind of thing. A ship in trouble broadcasts wide and everybody hears it, which is the entire point of an emergency band and is true of every one that has ever existed.

- **Five things go on it**: a freighter being run down (UNDER ATTACK), a civilian under a runner's guns (UNDER FIRE), customs running somebody down (PURSUIT), two empires' hulls finding each other (SHOTS FIRED), and — when it lands — a rendezvous. The first two ask for help; the others are simply things happening that you can fly at.
- **It tells you where she was, not where she is.** The position is the one in the last broadcast, and the broadcasts are a minute apart, so a running fight is always behind its own mark. The row says how old it is.
- **It goes quiet.** Thirty minutes without a rebroadcast and the entry drops: either it is over or nobody is left to send.
- **It does not tell you who is winning.** "Under fire" is what a distress call says. What you find when you get there is what you find.
- **A call that ends says what happened** — `robbed`, `withdrew` — and goes grey. "She got away" is news too.
- **A band row is a nav row**, so hearing it and flying at it are one action: it appears in the F3 contact list sorted by range with the rest of the system, marked `!` in red when somebody is asking for help and `%` when it is over. The F4 comms screen carries the band in its own block under the channel list, behind a rule, because the two are different kinds of thing and should not read as one list.
- **Answering one is noticed.** Arriving within 12,000 km of a call that asked for help earns a little standing with that ship's flag, once — the smaller thing of having come at all. The standing for actually driving somebody off is `aggression.js`'s and stays there.
- **Saves:** additive, **no version bump**. The band is saved so that a reload halfway to somebody's distress call does not lose the call; it prunes itself on the next read.

### Fixed (2026-11-11)

- **A nav row that is not a body no longer crashes the nav screen.** `navMark` read `entry.obj.kind` for anything that was not a ship — a latent crash since the magnetometer's field contacts landed in 1.3.1, because those rows carry `obj: null` by design (a fix is a position, not a thing). It never showed in testing because an unfound classified contact is rare; the open band made it common and `tools/probe-band.js` caught it in the first frame. Field contacts now mark `~`, incidents `!` or `%`.

- **Tests:** `test/band.test.js` (33 checks, `combat` group): a call goes out and the same ship in the same trouble does not go on twice; the mark moves only on a rebroadcast; it goes quiet on its own clock; a call from the system you left is kept but not shown; the rows are nav rows sorted by range with the finished ones grey; answering one is noticed once and not every frame; and the band holds a fixed number of calls, oldest off the end. `tools/probe-band.js` puts calls at real traffic positions in the running game and photographs both screens.

### Added (2026-11-11, the surveyor's chain, and a Guild that keeps books)

The third power chain, and the only one that is not a side. Astra chose its shape: the Guild **locks nothing** — it is a trade body, not a faction. It buys surveys from everybody at every desk, it holds no space, and it does not care whose roll your name is on.

**The Guild keeps a ledger now.** Until today it bought survey data from anybody and remembered nothing, which made "survey standing" a phrase rather than a number. One point per 15,000 cr of data sold, capped at six per sale so one enormous world does not buy the whole relationship: the Guild's good opinion is made of exactly one thing, numbers it did not have before, and it is built rather than bought. It shows on the F7 standing list under the local flags, where it belongs — it flies no flag and is in nobody's faction list.

**The Long Read**, five chapters, gated at +20 with the Guild (`src/arcs.js`). The other two chains are about a leak; this one is the mining ladder the game already has — survey, claim, extract, found, supply — run end to end by somebody who is being watched while they do it, and then asked for one thing more than the ladder covers.

1. **A Proper Reading** — map one world the whole way round, 65%, and bring the file in yourself. *"Everyone sells the Guild scraps."*
2. **The Rock Itself** — hold the ground, put a pod on it, bring back what it actually brings up. Checked against a live claim as well as the hold: *"the Guild has been burned by files."*
3. **Where You Said It Should Be** — found a port, anywhere in the system, orbital or on the ground. The Guild is not choosing the spot; that is the entire test.
4. **The Part Nobody Films** — supply it. *"Founding one is a photograph. Keeping it is a job."*
5. **Somebody Else's Ground** — read the world a classified installation is sitting on. *"They are not asking what the installation is — they are asking what is underneath it."*

- **It commits you to nothing.** No allegiance is set at chapter three and none bars it, so a pilot already on a fleet roll or a slate can run it start to finish, and the warning the other two give at chapter two is correctly silent here.
- **The reward is the only grade-4 instrument in the game**: a **shielded deep array**, Guild issue, on no shelf at any price (the same `unlisted` flag the forged transponder uses — a listing with a reason would advertise the chain to somebody who has not run it). What the extra grade buys is the thing a surveyor actually wants: **a third more ground per pass**, which over a world is the difference between three orbits and two. Plus 40,000 cr and +25.
- **Every chapter is cast against the real system and degrades rather than stalling**, like the sequels' chapters: no readable world, no own port to supply, and the chapter still happens — the words are the story.
- **A chapter that carries nothing still pays.** `basePay` was tonnage times forty with a handful of freight-shaped exceptions, so the surveyor's chapters came out at a fee of **zero**; and the supply run, once it degraded to an ordinary haul, came out at **792 cr** sitting between a founding at 49,400 and a last chapter at 71,920. Both found by the suite walking the chain end to end, which is the only way a number like that shows itself. The five now pay about 12,000 / 17,000 / 49,000 / 18,000 / 72,000 — not monotonic, deliberately: founding a port is the expensive chapter and supplying it is not.
- **Saves:** additive, **no version bump**.
- **Tests:** `test/guild.test.js` (40 checks, `story` group): the chain exists and is flagged neutral, the Guild bars nobody while the other two still bar each other, the ledger's rate and cap, the reward is the only grade 4 and is on no shelf and reads measurably wider, the chain refuses a stranger and opens to somebody who has done the work, and all five chapters run in order against a real kawartha system and pay.

### Changed (2026-11-11)

- **Walking into a classified installation pays about 2× the position's value rather than 3.4×**, and watching one about 1.5× rather than 2.1× (Astra, after reading the numbers: at the top end the old multiplier was a Kestrel for one job). Walking in still pays more than watching — the prize is that you *can* do it, not that it makes the rest of the game irrelevant.

### Added (2026-11-10, what a secret is worth, and the three ways to spend it)

Astra, on what finding a black site should be good for: *"Sell the location. You can go there and trade. Missions key off it."* And later, on the shape of the work: *"to spy for a rival empire on a secret installation for which you have already obtained clearance, like being recruited on a station while doing some other skullduggery shit..."* This is all of that (`src/intel.js`, new).

**A fix is a commodity with a shelf life.** The coil already wrote a find into `G.found`; it now writes down **whose it is**, what sort of place it is, and what colours it flies, because a position you want to *sell* has to say who it belongs to, and the only moment that is in hand is the moment of the fix — a system four jumps away is not regenerated to answer a question at a desk. An older career's bare epoch still reads as a find; it simply has nobody to sell it to, and the desk says so.

- **Only somebody who wants it pays.** A rival of the people who built it pays full; the Syndicate pays three quarters, because it will buy anybody's; a neutral pays a third and is doing you a favour. The people who built it will not hear it at all — *"this is theirs — telling them where it is only tells them you were out there."* The Syndicate will not buy a cache from you either: one organization across the whole map, however many bands fly their own colours.
- **A Syndicate berth inside an empire is worth 30% more** to that empire's rivals than a quiet works of their own, because it is evidence as well as a position.
- **It goes off.** Half-life of 150 days, floored at a quarter — the rotations change, the orbit does not. A fresh fix on a naval listening post runs about 41,000 cr to a rival; a two-year-old one is about a tenth of a hull.
- **The quote cannot be shopped.** Walk out of the office and back in and it is the same number: the desk's margin is seeded on the fix, the desk and the fortnight. A month later it is a different margin and a staler fix.
- **Selling it twice is how you get caught.** The first sale is a rumour with no source. A resale pays a third *and* is certain to come back on you; selling to both sides of a rivalry costs you with the first buyer too, who paid for something nobody else was supposed to have. Every sale after the first raises the odds, which makes *"how much do I squeeze out of this"* an actual decision rather than a button.
- It is sold at any desk, on the F4 deck list, between the survey data and the mining claim — the same ladder, one rung further along.

**And then the approach, which is the better idea somebody has instead of buying it.** Hold a fix nobody has bought yet, dock in a rival's space, and the board carries two rows it has never carried before. They are **mutually exclusive with each other and with the sale**: committing to one takes the position off the market entirely, including to a third party.

- **Sit off it and count the traffic** — about 2.1× what the position alone would fetch. Hold station within 90,000 km of it for sixty hours of **ship time**, counted as it passes, so the warp pays for it honestly: the clock *is* the job. Docking at it does not count — a watch is what you see from outside, which is also what keeps it a different job from the next one.
- **Walk into it and come back out** — about 3.4×, and **gated on the owner's good opinion of you**: you need +25 standing with the people whose secret it is, because they will let you in on exactly that. The row is on the board whether or not you qualify, greyed, saying *"they would not let you through the door — you need 25 with them, you have 0."* Seeing the job you cannot take is what makes their good opinion worth having. The act is docking at the installation itself.
- **Both are louder than a sale.** A watch comes back on you a little under half the time; walking in, seven times in ten. The people who trusted you enough to open the door are the people who find out — which is the whole joke of the thing, and the reason it pays what it pays.
- **Saves:** additive, **no version bump**. `intel` (what you have sold and to whom) joins the store; the risk model is entirely a function of it, so a reload cannot launder it. A find written before today keeps its bare epoch and is simply unsaleable.
- **Tests:** `test/intel.test.js` (67 checks, `core` group); `tools/probe-intel.js` plants a find in the running game, prices it against every flag in the galaxy, reads the approach off the board and sells the position at a real desk.

### Added (2026-11-10, business brought to a desk, and work for a ship with instruments)

Astra, on two things the board was missing: *"I also want there to be a larger variety of missions that are available to the player at a lower notoriety. You should also gain faction level by bringing good trade to that faction, say an increase of 2 for every 100,000 cr in berth fees and fuel and stuff (equipment, ships and modules) you've bought from faction stations?"* Her answers on the design: **services only** (not cargo trade), **capped around +25**, and *"short hop missions need to pay at least twice as much or they aren't worth the time it takes to do them."*

**Patronage: the money you spend at a desk buys some of its goodwill** (`Missions.patronage`, `src/missions.js`).

- **+2 standing per 100,000 cr of services**, booked to whoever flies the flag over the port that took it: berth fees (your own arrears and your laid-up fleet's weekly bill), fuel, repairs, outfitting, ordnance, a repaint, a hull, and a yard build to order. **Not cargo trade** — what a market pays you for grain is not money you gave anybody.
- **Capped at +25 from spending alone.** The cap is on what money bought, not on standing: work you fly for them still carries you well past it.
- **Kept as a ledger, not a per-purchase bonus**: two numbers per faction, what you have spent and what it has already paid out. So ten small top-ups are worth one big one, the cap is exact, and no reload, refund or rounding can be paid for twice. A trade-in that pays *you* out is not business brought to the yard and counts for nothing. The books are kept in whole credits so a long career cannot drift on fuel priced per fraction of a tonne.
- **A marked career buys nothing.** The `G.marks` guard still forces −100: a desk that has you marked takes your fuel money and still wants you dead.
- **It shows on F7**, beside the standing it bought: `trade +6`, or `trade +25 max`.
- **Saves:** additive, **no version bump**. A career from before the ledger starts at nothing, which is honest — it was never counted.

**Five new kinds of board work, all open at zero standing** (`src/fieldwork.js`, new).

The board is dealt per port and per window rather than per career — a deliberate property, and the reason `missions.js` has written down three separate times that *"what you are cleared for is not in scope here."* These contracts do depend on the career: on what is bolted to the hull and what you have already mapped. So rather than make the whole board career-dependent and re-deal every port in every seed, each new pass runs **last, in its own stream**, and adds rows. **An existing board is byte-identical with this file loaded and no instruments fitted**, and the suite checks exactly that.

- **Short hops** — in-system runs **priced by the clock, not the tonne**. The old board paid 250 cr plus 28–55 a tonne for any haul, which for a four-tonne run to the next moon is a fee you would decline on principle: *"Run 5t Textiles to Low Vault — 374 cr."* A hop estimates the round trip, pays for the hours at **2.2× the hourly rate** with a 900 cr floor, and is due **tomorrow** rather than in three days: *"A pallet of spares, 2 t, over to Coldwater Post by tomorrow — 2,979 cr."* The multiplier is on the hour rate rather than bolted on at the end, so a genuinely quick hop stays a small fee and one across a system you misjudged still pays for the day it ate.
- **Survey contracts** (needs a survey scanner) — map a stated fraction of a named world and bring the file back. Measured against **where your own survey stood when you signed**, so a world you had already mapped is not a contract you complete by docking, and a world you are halfway through is credit you keep. Paid per point of new coverage. The data stays yours and still sells to the Guild; what the client bought is a copy.
- **Sweep contracts** (needs the magnetometer) — take the coil out past the charted bodies and report what answered. **A confirmed nothing is paid**, at 45% — because a contract that only pays on a hit is paying you to invent one, and *"we swept it and there is nothing there"* is the answer a shipping line actually needed.
- **Prospect contracts** — tonnage **off a named world**, checked against a live claim as well as the hold. Buying the same ore on the market and docking with it does not satisfy it: the provenance is what the client is paying for, and they pay about 2.4× market for it. Signing hands you nothing — this is the one freight contract you go and dig.
- **Recovery contracts** — an outfit winding up in the system wants its mining pod back off a rock rather than written off (the NPC prospectors in `claims.js`, who have been sitting out there filling hoppers since October). **The mechanical content of the contract is that prying it loose is lawful**: same hands, same rock, same pod, and the only difference is whether the owner asked. `claims.js` now asks `Fieldwork.lawfulPry` before it logs a theft, so a contracted pod comes aboard cold and an uninvited one is still HOT. Whatever is in the hopper when you get there is yours.
- **The capability ledger** (`Fieldwork.capsOf`): one pass over a career — instrument grades, free hold, worlds mapped and how much of each, claims held, ports founded, installations found — read once per board rather than guessed at per branch. Everything in it is a primitive or a count; nothing live can reach a signed contract or a save.
- **The contract rows say what is actually left.** A fieldwork contract is not short of freight, so the F7 list no longer reads `FREIGHT MISSING (0/0t)` at one: it says `0% of Mirven I, need 28%`, or `no live claim on Mirven I — file one at any desk`, or `the pod is on Mirven V`. The board's third column stops saying "0t of hold" and says what the work actually costs you: a survey scanner, a magnetometer, a free drone rack, or tonnes to dig and carry.
- **Saves:** additive, **no version bump**. The new contract fields ride on `G.missions`, which was already saved whole.
- **Tests:** `test/patronage.test.js` (33 checks) and `test/fieldwork.test.js` (69 checks), both in the `story` group; `tools/probe-fieldwork.js` fits the instruments, docks and reads the board in the running game.

---

## 1.3.1 "Clementine" (2026-11-10)

### Added (2026-11-10, the installations nobody lists, and the coil that finds them)

Astra: *"we can use the magnetometer to detect space ports in systems you don't have a chart for, especially for classified military or corporate outposts."* Her answers on the design: hide both new classified outposts **and** existing military berths; let the sweep reach the next system over as well as this one; finding one should let you sell the location, trade there, and open work; and the sweep is an **active ping that costs power**, not a passive always-on reading.

**This entry covers the first three of those four.** Selling the location and the missions that key off a find are not built yet — see "Not yet" below.

- **Black sites**, allocated against a galaxy-wide budget (`assignBlackSites` in `src/galaxy.js`, built by `buildBlackSites` in `src/generate.js`). Astra: *"there shouldn't be more than maybe five or ten black sites per organization per empire."* That is a sentence about the whole map, which a per-system roll cannot express at all — the first version rolled a chance per system and got however many four hundred stars happened to give it. So the allocation moved to `galaxy.js`, beside the penal colonies and warship yards, and `generate.js` now builds what it is handed and decides nothing.
  Three organizations: a fleet keeps **naval listening posts**, an industrial power keeps **unlisted works**, and the Syndicate keeps **caches** — the Syndicate's spread across the bands' own space rather than any one empire's. Each is a real port, with a market and a berth you can dock at, orbiting the **outermost world** on a steeply inclined orbit (22–61° off the ecliptic), as far from its owner's capital as the roster allows. **Certain** at a warship yard or a penal colony, since that is what the restriction was always about; **never** on an unclaimed star, where "no port, no market, no law" is a standing invariant; never on the doorstep of home; and never within 5 ly of another. Measured on the kawartha galaxy: 39 sites over 450 stars — 4 to 6 of each sort per empire, 8 Syndicate caches, all 6 restricted stars covered.
- **A few are latent.** Astra: *"a few of them shouldn't even be generated until you're supposed to be looking for them."* About a quarter of the allocation is marked `gated`: fixed by the seed like everything else — same star, same sort, same place — but **not built into the world at all** until a career has been pointed at it. `generate.js` reads `opts.reveal`, `main.js` passes `G.revealed` into every system it builds, and `save.js` keeps it, so a reload does not quietly take one back out of the world. Nothing writes to `G.revealed` yet; that is the missions work, and the plumbing is there so it needs no new machinery when it comes. Measured: 7 of 39 held back, each appearing on request, and revealing one does not conjure the rest.
- **And the military berths in a restricted system go quiet too**: navy and Syndicate ports there are flagged unlisted, so a warship yard's own berths are not on the sheets a broker sells.
- **Off every list, never out of the world** (`listed` in `src/main.js`, `shown` in `src/screens.js`). A classified installation is dropped from the nav list, the system manifest, the station list, the scope, the orbit map's marks and its orbit line, and the best-price search — but it still has mass, it still orbits, and the renderer still draws it. You can stumble on one by eye; the instrument is the reliable way.
- **The field sweep, Q** (`Survey.runSweep`; `startFieldSweep`/`tickFieldSweep` in `src/main.js`). The magnetometer pointed outward instead of down. A port is a power plant, and that is a magnetic source; out where a site hides there is nothing else it could be. **Inverse square**, which is the whole difficulty curve: a site mutters from anywhere in its own system (a bearing with about 1,800 Mkm of error on it) and only ties down inside about 350 Mkm, so you hear it on arrival and then have to fly at it. A **fixed** contact is written down for good and joins every list; an unfixed one appears in the nav list as **UNKNOWN SOURCE** with its error, so you can lock it and steer at it. The coil **charges for six seconds of ship time**, and a tight reactor makes that longer rather than making it deafer — power buys time, not range. Q, not F or M: F refuels at a berth and M is the map layer.
- **A site is loud for its size, and that is the point.** It runs quiet in every band it can control — no beacon, no transponder, no lights — but it has no grid to draw on, so it carries its own reactor, and a reactor's steady field is the one emission you cannot turn off. Surface pads, by contrast, are buried in their world's own field and read at a quarter to a half of a station of the same size.
- **Saves:** **no version bump.** The sites come from the seed like everything else; what you have found is a new additive key (`found`, keyed `star:body`, valued with the epoch), and a career that predates the coil simply has none — which is exactly true.
- **The additive rule, proved rather than asserted:** `opts.noBlackSites` leaves them out, and the suite checks that 40 systems then produce bit-identical bodies, ids, orbits, market roles, timetables, patrols and pads. Three things that would have broken that were caught by the suite and fixed: an id derived from `sys.bodies.length` (moved whenever anything else added a body), a presence test that read `sys.development` (which the twilight pass changes, so the same seed gained or lost a site depending on an unrelated option), and a value of `0` stored for a find at epoch 0 (falsy, so the find never stuck). The site also had to stop claiming a livery and a drawn role it does not have — a secret installation flies no colours and is not a refinery.
- **Tests:** `test/blacksites.test.js` (42 checks, `core` group): additive with the sites off; seeded and stable; the budget held per organization per empire, with all three organizations represented, nothing on an unclaimed star and nothing on the doorstep of home; the latent ones withheld by default, each appearing when revealed and only when revealed; a bare seed with no galaxy round it hiding nothing at all; remote and off the plane; a real port with a market that no scheduled traffic calls at; and the sweep — audible across its own system, a shrug at that range, tightening as you close, inverse square to within 1%, writing down only the hidden ones, never finding the same thing twice, and slower rather than deafer on a tight reactor. `tools/probe-blacksite.js` presses Q in the real game and watches a site go from unheard to found.
- **Not yet:** selling a location to a rival power or a news desk; missions keying off a find; and the faint count of powered sources in **neighbouring** systems, which she asked for and which needs the chart screen.

### Added (2026-11-10, weather you can stand in: snow, ash, thunder, and the fall in every view)

Astra: *"I want the planets to show the local weather from the cockpit, and the external camera view. That means clouds which can be flown through, and storms which rain, snow and thunder/lightning as viewed from on the surface of a planet."*

- **The fall is drawn in every view that is inside a world's air**, not only the cockpit. It was a canopy effect, which meant stepping to the chase camera six metres away stopped the rain. One `weatherFall` now serves the cockpit (clipped by the glass, as before), the external camera, and standing outside in a suit; what differs between them is only where it is clipped.
- **Snow** (`Weather.precipKind`). What falls is decided by the ground it falls on, using the same ice field the planet is *painted* with: snow lands where the cap is, so flying from a green coast into the white at the top of the world turns the rain to snow at the line you can see out of the window, and a tidally locked world's night side snows for the same reason its night side is white. A world with no cap never snows, at any latitude. Snow is drawn as drifting, swaying flakes at their own speeds, leaned over by the storm and by airspeed — the near half as short streaks, the far half as dots, because round dots alone read as a starfield (which is exactly what the first version looked like against a night sky).
- **Ash over a molten world**, for the same reason in reverse: a molten world's deck is not made of water and should not arrive as though it were. Dark flecks, wandering more and falling slower than snow, a few of them still warm.
- **Thunder** (`Sound.fx('thunder', near)`). The flash is drawn the instant the sky fires; the sound is queued for when it would actually get here, at 343 m/s over a distance taken from that strike's own salt — so a storm you are standing in cracks and one on the horizon rolls, and the gap between flash and bang is the thing that tells you which. One sound with a distance knob: the crack is the shock front and only a near strike still has one; the roll is that same front smeared by the miles it came through. Queued in real time, not sim time, because a rumble that has left the cloud is on its way whatever the clock does. `Sound.fx` takes a second argument now; every existing call is unaffected.
- **The flash is capped lower** (0.5, was 0.8, over `lighter`). Against an already-bright sky — a molten world's orange overcast — a strike took the whole canopy to flat white, and a white rectangle is not a flash, it is a missing frame.
- **`GLWorld.spinOf` now reports `slot`**, which strike this is, so the thunder can queue one rumble per strike rather than one per frame.
- **Saves:** unchanged; nothing here is stored. The drift runs on real time (the same decision the aurora shimmer made) so time warp does not make the sky look empty; what the weather *is* still comes from `G.t`.
- **Tests:** `test/precip.test.js` (9 checks, in the `core` group): the snow line sits between pole and equator on an iced world and the fall is all snow inside the cap and none at the equator; lava gives ash and no water; a world with no cap never snows; `precipKind` is a pure function of where you are; `aloft` carries the shares through and they never exceed the fall. `tools/probe-weather.js` flies under the worst cloud on a wet, an icy and a molten world and shoots the cockpit and the external camera for each.

### Added (2026-11-10, the planetary scanner: 1 degree survey cells, a magnetometer, the field map, and a full-screen scanner view)

Astra: *"give us also a magnetic field mapping function on the planetary scanner. The output of the scanner including location of the deposits in X/Y coordinates on a flattened projection of the planet's surface, how rich the deposits are and what they contain (if the scanner is of adequate quality) as well as a magnetic field. Polar orbits are displayed as a top to bottom, left to right scanning of the ship over the X,Y grid, and when an orbit is completed and the planet has rotated underneath the ship, the next column is begun. The same goes with magnetic fields. Use both heatmaps and field lines for the magnetic fields, and heatmaps and a legend for the resource scanning."* Her answers on the design: show it on both the SURVEY page and a full screen, with the full-screen scanner the primary; raise the grid to 1 degree cells; the magnetometer is a separate instrument.

- **The survey grid is 1 degree** (`src/survey.js`: `LAT_BINS 180`, `LON_BINS 360`, 64,800 cells; was 12 by 24). Old records are upsampled on read (`cellsOf` recognises the 72-hex-digit legacy string), so no career loses ground and **the save version is not bumped**. `markAt` is row-based so a swath over 64,800 cells is still cheap; the equatorial-band coverage is scaled to the same +/-15 degrees.
- **The magnetometer** (`src/combat.js`): a separate utility item, 4,200 cr, 0.6 power, 1 t, its own `uniqueGroup: 'magnet'` so it fits beside any survey scanner, sold where development is 0.20 or better. It maps the field along the same ground track and swath as the scanner, into its own coverage record (`rec.cellsM`, `rec.covM`), with "MAGNETIC <world> - N% mapped" messages at 25/50/75/95%. A magnetometer alone makes a record and maps no ore; a scanner alone maps ore and no field.
- **The field model** (`Survey.magMap`, cached per world): the dipole, `strength * sqrt(1 + 3 sin^2(magnetic latitude)) / 2` (poles read twice the magnetic equator), plus ore-province anomalies of up to 0.30 where the ground is richer than the world average, so a dead rock with ore still shows structure. `Survey.fieldLines` returns the surface footprints of the dipole lines (the magnetic meridians, pole to pole) and the two poles.
- **The full-screen scanner, Shift+F3** (`src/screens.js`, a hidden mode like the node planner): a flattened map, one pixel a cell. X is scan longitude in degrees, counted so a world that turns the usual way puts the newest columns on the right as it turns under a polar orbit; Y is latitude. Layers: RESOURCES (the most valuable commodity read in each cell, brighter where richer), MAGNETIC (a heatmap, dark blue through teal and yellow to orange), BOTH (field underneath, ore on top); a commodity filter (C); the field lines over ground the magnetometer has read, each with a pointer at its middle, and the two magnetic poles marked (L toggles them). Unflown ground stays dark. The ship is a cross-hair on a lit column. Hover for a reading at any cell (X, Y, field, what was read there); click to pin it. A legend lists the five commodities (unread classes greyed and named) and the field scale. The deposit list gives, per commodity the fitted scanner can read, the richest places with X/Y, a grade bar, and tonnes (an estimate, marked ~) only when the deep array has mapped enough; click one to pin it. Keys: R, M, B, C, L.
- **Three ways to colour the ground (S, or the STYLE button), her follow-up the same afternoon:** *"we want the heatmap detail to be at least 16 bit in terms of colors... maybe even weather radar type heatmap color scheme... give the player a couple different ways to display the data."* RADAR (the default) is a continuous 24-bit weather-radar ramp, dark teal through green, yellow, orange and red to magenta, smoothed when drawn; each commodity is coloured by how far a cell stands above that commodity's *typical* ground on the world (its median) up to its best, so a wet world is quiet where it is merely wet and lights up at the hotspots (measured by eye on a terran world: the first version, scaled on absolute grade, flooded every ocean yellow). HUES is one colour per commodity, brighter where richer (the first version). BANDS is the radar ramp in seven steps, like a contour map. The magnetic heatmap is its own continuous ramp. The picture is one pixel a cell, 1 degree; a finer grid than that is a separate decision (it would quadruple the saved survey records) and was not taken.
- **Pictographs** (`scanGlyph`, drawn as paths so they look the same everywhere): a faceted rock for metal ores, a cut gem for rare metals, the radiation trefoil for fissiles, a drop for water ice, an atom for hydrogen. They mark the richest places read on the map itself, head the legend and the deposit list, and appear in the hover strip for what is under the cursor; colour says what, the radar ramp says how rich.
- **Three ways to show the sweep (T, or the SWEEP button):** FIXED (a lit column where the ship is, the first version); TRACK (the default: the ship's real ground track drawn as a fading trail with direction arrowheads, which slants across the map because the planet turns under a polar orbit; `Survey.step` records the sub-ship cell in the transient `G._track`, 720 points, not saved); FOLLOW (the map scrolls so the ship's column stays in the middle and the ground about to be read is always under it, the X ticks relabelling as it goes).
- **The SURVEY MFD page** now draws the scanner's picture scaled down in place of the old 24 by 12 block map, with the ship marked, and says Shift+F3 opens the full screen.
- **A drone goes where you point (D, or the button under the map), and the map zooms.** Astra: *"make the survey map allow you to deploy a mining drone to any particular cell. Add the ability to zoom in on the map."* `Claims.deployAt(G, sys, t, world, cell)` puts a mining drone on a chosen cell: it wants the same live claim and drone aboard that landing and pressing N wants, plus the cell must be ground your survey has READ, and you must be there — landed on that world, or in orbit within the survey range. Landed, the drone walks over for nothing; from orbit it goes down in a pod, which costs 0.3 t of reaction mass for the de-orbit burn. It digs what is under *it* at that cell's grade, so dropping on the ore body beats dropping beside it (measured: 0.47 grade against 0.06 on the same world is 6.4 t against 0.8 t in the hopper after a month). Pressing N where you stand is untouched. Drones already down — yours in green, other people's in orange — are drawn on the map, and a cell that has one refuses a second.
- **Zoom and pan:** the wheel zooms about the cursor, +/- and Z step it, 1x / 2x / 4x / 8x, and the arrow keys pan; the graticule tightens from 30° to 5° as you go in, and the longitude window wraps across the seam. Clicking a row in the DEPOSITS list pins that cell and walks the view to it, which is the only sane way to find one 1-degree cell on a zoomed map. Zooming or panning drops SWEEP out of FOLLOW, since a map that follows the ship and a map you are steering are two different maps.
- **Tests:** `test/dronedrop.test.js` (15 checks, ground group): every refusal with its reason (no claim, no drone, unmapped ground, too far away, not enough reaction mass); the pod costs exactly `POD_FUEL`; the drone lands on the cell asked for; it digs the commodity under that cell at that cell's grade; a rich cell out-produces a poor one after a month; landed deployment is free and N still works.
- **Tests:** `test/magnetometer.test.js` (21 checks, core group): the two magnetic-axis helpers agree; pole/equator ratio 2.00; a dead rock shows ore anomalies; field lines run pole to pole; a magnetometer alone maps the field (covM above 90% on a polar orbit) and no ore; a scanner alone the reverse; an equatorial orbit maps a band (about 34%); the item is a utility with its own group. `tools/probe-scanner.js` flies a synthetic polar survey in the real game and screenshots the three layers.

### Added (2026-11-10, aurorae, magnetic fields and a deeper atmospheric envelope)

Astra: *"aurorae and the atmospheric envelope should be added to the planets."* Her answers on the design (2026-11-10): "defaults, I agree with you on that." No departures from them.

- **A seeded magnetic field per world** (`buildMagnetospheres` in `src/generate.js`, called straight after `buildRotations`, in its own `base.fork('magnetosphere')` substream, one fork per body). `body.magnetosphere = { strength 0..1, tilt, az, activity }` or `null`. It is a dipole: `tilt` is the lean of the magnetic axis off the spin axis, `az` the direction in the body frame (so the field turns with the planet), `activity` how hard the star drives it. Rules: gas giants always have one (0.7–1.0, tilt 0–12°); ice giants always (0.6–0.95, tilt 40–60°, Uranus/Neptune-like); rock is a chance by type (terran 0.75, ocean 0.70, tundra 0.50, molten 0.35, desert 0.25, rocky 0.20, iceball 0.10), scaled up for fast spinners and halved for slow or tidally locked worlds; a moon with a trace of air has a 15% chance of a weak one. A field over a world with no air is still a field (the coming magnetometer reads it) but burns no aurora. Measured over 40 systems (919 worlds): every giant (104/104) has one; terran 21/40, ocean 21/38, tundra 17/50, desert 6/48, rocky 5/45, iceball 3/35, molten 1/14.
- **`opts.noMagnetosphere`** leaves every field out; `test/magnetosphere.test.js` proves nothing else in the system (bodies, rotations, atmospheres, ports, traffic) moves.
- **Aurorae from orbit** (`src/gl.js`, the planet shader): a glowing oval round both magnetic poles, at a colatitude set by the field and the star's activity and pushed equatorward on the day side, with slowly drifting curtains, a slow substorm pulse, brighter on the night side, and a fringe in a second colour. Colours by world type: green with a magenta fringe over terran and ocean worlds, teal and blue over tundra and ice, amber and red over molten, violet and pink over gas giants, blue-violet and magenta over ice giants. Seen from the side the oval is a bright sliver on the limb; from above it is a ring. Aurorae appear only on worlds with both air and a field. The shimmer runs on real time, not game time, so time warp does not strobe it. Not drawn from the ground yet (a later slice).
- **The envelope is as deep as the air is tall.** The limb halo's depth now scales with the atmosphere's scale height (`GL.haloThickness`): a gas giant gets a deep soft shell, a thin world a hairline; the halo fades out toward the edge of its quad instead of being cut off hard, and the quad grows to fit. A reddened twilight band now lies along the terminator, on the disc and in the halo.
- **Saves:** unchanged. Additive; the field is derived from the seed on every load, nothing is stored, and the save version is not bumped.
- **Tests:** `test/magnetosphere.test.js` (20 checks, in the `core` group): same seed same field; `noMagnetosphere` moves nothing; every giant has a field; ice giants lean 40°+; ranges; `GL.magAxis` is a unit vector at exactly the tilt off the spin axis and turns with the world; the halo scales with scale height and is clamped; the shader carries the new uniforms. `tools/probe-aurora.js` frames a terran world, a gas giant and an ice giant from above in the real game for the picture itself (the GLSL cannot be compiled in node).
- **Not yet:** the aurora from the surface; a field-driven radiation belt. (The magnetometer and field map landed the same day, entry above.)
## 1.3.0-beta "Cricket" (2026-11-10)

Named for Cricket, a pigeon from the rescue. Everything below, down to
Brian, is in this release: the nine days since Brian was tagged.

**The ground and the sea.** Worlds have biomes, ground ports sit on real
ground with towns around them, and sea platforms stand on open water. The
drive works in an atmosphere. Systems can have more than one star, and
habitable zones are warmer and fuller.

**Getting where you are going.** A lead pip shows where to meet a moving
target, and an intercept assist flies you there. The galaxy chart zooms.
Every hull now carries a slipspace drive sized to her frame (Class I on S
hulls, II on M, III on L, IV on XL), and a better one reaches further on a
tank. The military drive has a milfuel tank sized to the ship, filled from
the hold on the SHIP screen.

**Trade and the yard.** Captain Halloway teaches the first run. The
economy is retuned, and there is a trade analyser and trading houses that
run an account for your ships. Every item on sale has its own model: the
yard opens a card with it turning and a BUY button. Fitted guns show on
the hull, and the proton linacs and civil slipspace drives are new.

**Stations.** Stations got four passes on their geometry: lifts that come
for you and carry you, routes that miss the walls, and level pads in the
tilted bays.

**Surfaces.** Everything you see is plated, worn and lit: stations inside
and out, the decks and rooms you walk from the ramp onward (wood, tile,
vinyl, chipped paint, billboards), and every ship, outside and in. The
Syndicate's docks lay their decks in hex plate and the Navy's wear armour.

**Saves:** a Brian career loads. On load, every ship (yours and the
fleet's) is given her frame's slipspace drive, which jumps exactly as far
as she always did on an S hull. Milfuel in the hold moves into a military
drive's tank once, as far as it fits. Each entry below has its own Saves
note where one was needed.

Everything that changed is listed below, newest first.

### Added (2026-11-10, hex decks, Navy armour, every station surface, the decks on foot and every ship)

Astra: "let's have some hexagonal deck plates on syndicate stations, and
Navy stations should have armor plates on the exterior, and this should be
textured. All exterior and interior station models must be textured."
Then: "textures can include higher-quality bars and ship hulls, also." Asked
what "bars" meant: "the general station interior decoration, with the
billboards and whatnot. Everything from disembarking from the ship
onward." And for ships: "All ships, outside and in".

- **Hex deck plates on the Syndicate's stations.** Every deck that faces up
  on a Syndicate dock, inside and out, is laid in hexagonal plates instead
  of rectangular ones. Each hex is its own shade, the odd one has been
  replaced, and close to there's a raised rim inside its edge and a bolt at
  its centre. The big lit deck slabs carry on the same hexes. Walls and
  ceilings keep their plating. The Syndicate's concourse is hex plate too,
  where everyone else's is tiled.
- **Armour on the Navy's stations.** Outside, every face of a Navy station
  is heavy armour plate in place of the light plating: big plates in
  staggered courses, dark joints, a chamfered edge that catches the light
  above and falls into shade below, a row of bolts a hand inside every
  edge, and a cast-steel mottle in the metal. Now and then a plate is newer
  and a shade darker. The joints stay about a pixel wide out to 600 m, so
  the courses still read from a distance. Her halls inside are as they
  were.
- **Every station model, inside and out.** Before, the surface reached a
  station's hull, spinning part, interior and outworks. Now it also covers:
  - a ground port's boards and posts, lamp housings and shaft doors;
  - the hangar deck she berths on, seen from aboard;
  - every deck and room you walk on foot (they go through the cockpit's
    pass, which never carried the surface before).

  The deck plans you walk on stand y up where the station art stands z up,
  so the shader is told which, or floors would have come out plated as
  walls. Left plain on purpose: lights, the small craft working round her,
  the earth and rock of a ground port's cut, and glass.
- **The decks on foot get materials.** The dressing already builds every
  prop from named palettes. Each face now carries which one it was (and,
  for the Navy, grey laminate where the others have wood), and each quad
  its own metres, so a pattern runs along its plank or sits square on its
  booth:
  - tiled floors in the concourse and the crew hall, and floorboards in
    the bar;
  - planked wood with grain, rings, butt joints and worn edges on counters
    and tables;
  - tufted vinyl on the booths, with diamond creases, buttons and piping;
  - painted metal chipped at its edges, with stamped ribs and scratches, on
    crates, lockers and chairs;
  - rust, banded pipes, brushed brass;
  - billboards and signs: a bezel lit along its top edge, screws in the
    corners, and scanlines and a dark screen's faint glow behind the neon;
  - cloth banners with folds and weave.

  The halls' plating has heavier seams indoors, plus a lit lip on each
  plate, so it reads in dim rooms. Everything fades by the pixel's size, so
  nothing shimmers at a distance.
- **Every ship, outside and in.** Hulls are plated at their own size, with
  each plate about a fourteenth of her length (1.2 m on the smallest hull,
  6 m on a capital). Seams and shading are stronger than a station's, or
  they'd be lost in her paint. Now and then a plate is an access hatch or a
  vent. Navy and police hulls and capitals wear the armour plate; outlaw
  and pirate hulls are worn harder. There are no windows or hexes on a
  hull. Her rooms, her cockpit, and her cabin seen through her windows take
  the surface at their own metres. Each ship is seeded from her own id, so
  she wears the same plates every time. A ship drawn inside a station
  gives the station its surface back afterwards.
- **For Astra's own textures later:** each material is its own branch in
  the shader (gl.js `surfMat`; the codes are walk.js `SURF_MAT`), so an
  image can replace one without touching the rest.
- **Tests:** `test/surfaces.test.js` (24 checks): each surface is in the
  shader, and every deck face gets its material in every livery. It also
  checks that every draw path that puts station or ship metal on screen
  sets a surface round it. It fails on a path that forgets.
- **Saves:** unaffected. The walk-aboard decks are rebuilt from the seed as
  before, now with their materials.

### Added (2026-11-10, stations get a surface: plating, wear, decks, windows and lamps)

Astra: "texture the interior of the space ports, to make them feel more
alive, as well as the exterior." Of the two ways offered she chose detail
worked out per pixel on the GPU: "Option 1 is the right start; I can
always edit the textures later."

- **No UVs and no images needed** (`gl.js` SURF_GLSL). The station art
  carries one colour a face, and five of the models can't be re-exported.
  So the detail is laid out in metres on the model's own frame, on the
  plane each face is most nearly in: a plate is the same size on every
  station and stays put on the metal as you move.
- **Plating.** Big modules, each split by its own hash into one to three
  plates a side. Module joints are heavier than plate seams. Each plate is
  a shade off its neighbours, and now and then one is replaced, a clear
  shade lighter or darker. Smaller and closer together indoors.
- **Wear.** Grime in blotches, streaks running down the walls, scuffs on
  the decks. The fleet's docks keep theirs clean.
- **Indoors:** rivets at the plate corners close to; a fine grating and
  painted lane lines on the decks (red on Syndicate docks); status lamps on
  the walls, some steady and some blinking on the station's clock; and now
  and then a strip of cyan or amber light along a module's lower joint
  (red at the Syndicate's).
- **The lit decks** (the art's great self-lit floor and ceiling slabs) keep
  their light but show their module joints and plate shades, so a lit deck
  reads as a deck.
- **Outside:** rows of windows on the walls, some lit, warm or cool. The
  fleet's are busier and the Syndicate's fewer and red-orange.
- **Seeded per station** from her id, so she looks the same every visit and
  two stations of one model don't look stamped out. Every feature fades out
  once it's smaller than a couple of pixels, so a station seen from afar is
  the clean silhouette it was and nothing shimmers. Each feature is its own
  term in the shader, so a tileable image of Astra's can later replace one
  surface class's pattern without touching the rest.
- **Where:** a station's model, spinning part, interior and outworks
  (`Render.setSurface`, set and cleared round them in main.js like the
  accent). Ships, cockpits and everything else are unchanged. The 2D
  painter has no per-pixel stage and draws stations as before.
- **Cost:** none measurable in the browser at Halden Yard, inside or out
  (the frame held at its 33 ms either way).
- **Saves:** unaffected.

### Fixed (2026-11-10, the Cricket build: a test that couldn't see packed models)

Cricket's tag went up but neither the Windows nor the Linux build was made.
One check in `ground.test.js` ("every ground site model, the shed and the
tunnel fit inside INLAND_FOOT") read only the plain `src/ports/*site*.js`,
which are gitignored working copies. A fresh checkout, as on the build
machines, holds only the `.js.gz`, so the check found no models and failed.
It now reads the packed copy, which is what ships, as `city-sites.test.js`
already did. The game itself was never affected.

- **Saves:** unaffected.

### Fixed (2026-11-10, station routes: level onto the lifts where the art has room, and nothing through the walls)

The full suite before tagging found the station-grid routing from
2026-11-09 broken at every cradle and Syndicate yard: 27 arrivals went
inside the station and back out (berths.test, clean since 2026-11-04),
19 berths had a leg through structure and 17 found no open route
(interiors.test), and nobody drove level onto an inclined lift
(lanes.test). Astra chose to fix it before releasing.

- **Level on and off only where it fits** (`Sim seatRide`). The level
  corner either side of an inclined lift (her drawing) has to be inside the
  station and clear for the fleet's widest hull. It takes the longest such
  stub, from the full run-out down to just over a hull's half-width, and
  falls back to boarding along the rails if none fits. At the cradles the
  full level run-out off the head of the hoist went out of the station; at
  the head of the cylinders' and cradles' inclines the upper floor stands a
  step above the pad 30–40 m out, and a 20 m stub is clear. Every inclined
  lift is now boarded and left level. `rideLevel` records which ends are.
- **A level approach is not routed again** (`Sim transferJob`). It was
  proved clear when it was built; handing it to the router had it found
  "round" the step from above, which dropped her vertically onto the pad
  from 50–120 m.
- **The graph paper is judged harder** (`Render.axialRouteJob`). Its
  dog-legs run along the halls' walls, past every rib and conduit, so:
  - each leg is judged on a grid of rays across the whole hull, five
    across by four up (`routeLegClearDense`), not the centre and four edge
    lines a taut leg through open hall gets. spine-m b0 and b4 met a beam
    halfway out from the centre line;
  - each leg is judged for a hull 30% wider than she is (`AXIAL_ROOM`),
    since she turns on every corner. spine-l b0 and b2 had corners hard
    against the hall wall;
  - a chord is cut across every corner and judged the same way. A piece
    whose corners do not all pass keeps the clear route it came in with.
- **Still to model:** the flush top landing and the foot recess from her
  drawing. Today she drives level onto the pad from a short stub; with the
  landing she would drive straight on from the upper floor.
- **Tests:** berths, interiors and lanes green again.

### Fixed (2026-11-09, the intercept pip back under its millisecond)

- **A lock cost 1.2 ms a frame, and now costs about 0.15 ms.** The
  intercept test's budget for the pip is under 1 ms a frame, and it had
  been failing on the last release too. The pip's own solve was only
  0.03 ms. The cost was finding the locked target: `navTargetState` built
  the whole nav list (every body's state, every ship, every range, sorted)
  to pick out one entry, and half a dozen HUD parts ask for the lock every
  frame. It now builds the entry for the locked thing alone (`navEntry`,
  main.js), field for field what the list would have made, and still drops
  a ship lock while traffic is hidden, as the list did.
- Measured headless, best of runs: 3.2 ms a frame with no lock, 4.5–4.7 ms
  with one before, 3.4 ms after.

### Changed (2026-11-09, the slipspace bay: every hull carries her drive, sized to her frame)

Astra: "you need a slipspace drive or milfuel drive to travel from one
star system to another; a class I drive is standard with the spaceframe
of the S size ships, and class II comes with M size ships." This replaces
the reach and transit numbers in the entry below.

- **A slipspace bay on every hull** (`combat.js` THE SLIPSPACE BAY, slot
  `core0`, "Slipspace bay" in the yard). It holds the civil Slipspace
  Drive or the military drive, one or the other, and it is never empty.
- **Her size's drive comes with the frame:** Class I on S hulls, II on M,
  and, by the same step, III on L and IV on XL (Astra named S and M only;
  III and IV are the guess). Each covers her hull fully laden.
- **It costs no slot and no budget.** The bay is its own slot, so no
  internal slot is taken; a fighter keeps her only one. The standard drive
  costs nothing against fit mass or power, since every ship has always
  jumped on it. A bigger drive costs only its mass and power above the
  standard one: a Class II on a Talon asks 2 t and 0.9 MW.
- **No drive, no jump.** The jump planner refuses with "NO SLIPSPACE DRIVE"
  (`Slipspace.hasDriveCore`). In practice it never fires, because nothing
  can empty the bay.
- **Replaced, never sold off.** Buying a drive trades in the one in the
  bay at the usual 45%, the standard one included; the yard row quotes
  reach before and after, the trade-in and the net price. The fitting row
  says "standard with her frame · replace it from BUY". Trading the
  military drive for a civil one empties its milfuel tank into the hold.
- **Reach rebased so the game's calibration holds.** Class I is now the
  reach every jump was tuned on (×1.00), and each class up adds 15%
  (II ×1.15, III ×1.30, IV ×1.45). An S hull jumps exactly as far as
  before. An M hull's standard drive reaches 15% further than she used to,
  an L's 30% and an XL's 45%. A Talon reaches 24.3 / 28.0 / 31.6 /
  35.3 ly on Class I to IV.
- **Transit:** the corridor's timetable is now a civil drive's (no quarter
  off); the military drive still halves it.
- **Changing hulls:** the standard drive stays with the old hull and the
  new one arrives with her own. A drive better than the new hull's
  standard (military, or a higher civil class) comes across instead.
- **Saves and fleet ships** without a bay are given their size's drive on
  load, on taking command, and on respawn. A drive fitted in an internal
  slot during today's earlier build moves into the bay.
- **Tests:** drives.test.js rewritten (38 checks). combat.test and
  start.test updated for the ninth slot, and the starting kit's value
  leaves out the frame's own drive, which is in the hull's price.

### Added (2026-11-09, proton linacs, the civil Slipspace Drive, and a milfuel tank sized to the ship)

Astra: "The increased drive class should actually increase the possible
range jumped. Drive fuel can be refilled from the cargo hold and the ship
status screen, and maximums that fill up a slipspace drive/milfuel drive
are dependent on the size of the ship." The stats and the yard's words
for the three linacs and the civil drive were written to go with her
models.

- **Proton linacs** (`combat.js`, new `proton` particle, falloff 0.50):
  the Proton pulse linac (2,600 cr), Proton intermittent linac (4,600 cr)
  and Proton beam linac (7,200 cr), the pulse / intermittent / beam
  pattern of the other gun families, each with its own line on the card.
- **Slipspace Drive I to IV** (`slipspace.js MODULES.slipdrive`, 18,000 /
  32,000 / 52,000 / 78,000 cr; 5 / 7 / 10 / 13 t; 2.4 / 3.3 / 4.4 / 5.8 MW).
  It is the civilian core: the corridor at three quarters of the hours a
  light year (`CIVIL_FACTOR`), and the propellant goes further. The civil
  drive and the military drive are one core between them (`group:
  'slipcore'`), so a ship carries one or the other.
- **A bigger class jumps further.** Each class stretches a tonne of
  propellant (`RANGE_BY_CLASS`: I 1.15, II 1.30, III 1.45, IV 1.60), for
  whichever drive is doing the work: the military drive while it is armed,
  the civil one otherwise. An empty Talon on a full hydrogen tank reaches
  24.3 ly bare, then 28.0 / 31.6 / 35.3 / 38.9 ly on a Class I to IV civil
  drive, the drive's own mass included. A drive smaller than the hull's
  class still does nothing; the yard already says so.
- **The milfuel tank.** Milfuel used to burn straight out of the hold. A
  drive that burns it (the military slipspace drive, or a milfuel cruise
  drive) now brings a tank (`ship.milFuel`). It holds an eighth of her
  hydrogen tank, which is the ratio of what the two burn per light year,
  so a full one reaches as far as a full hydrogen tank on any hull:
  4.6 t on a Talon, 137.5 t on a Fleet Carrier.
- **Filled from the hold, on the SHIP screen.** The milfuel row in the
  hold has TO DRIVE (Enter does the same), the way hydrogen goes TO TANKS.
  Milfuel under contract is held back. What sits in the hold is cargo, and
  it no longer powers a jump or a cruise. The ship-status panel's jump-fuel
  line reads `mil x / cap` beside the hydrogen.
- **The tank goes with the drive.** When the last drive that burns milfuel
  comes off, by selling it or by trading it in for a plain cruise drive,
  what was in the tank goes back into the hold.
- **The range is cheap to ask.** The HUD reads the jump range every frame,
  and the range now asks which drive is running, its class and whether it
  covers the hull. Slipspace reads the fitted list once and keeps the
  answer until the hull or a slot changes (`slipFits`), so a plain frame
  costs a little less than before rather than more.
- **Saves:** `milFuel` is saved and carried in fleet records. A save from
  before the tank moves milfuel from the hold into the tank once, as far
  as it fits, so nobody loads up with a dry drive.
- **Tests:** drives.test.js (new, combat group, 22 checks). It covers range
  by class, hydrogen saved, transit, an undersized drive, one core, the
  tank on every hull, filling from the hold, a hot tank against a cold one,
  contract cargo, and unfit and trade-in returns. cruisedrive.test.js now
  fills the tank before it runs hot.

### Changed (2026-11-09, guns stay inside the hull's box; goods and crates shown)

Astra: "Rescale weapons so that existing collision boxes still work, and
then put the modules and trade goods in their respective places on
stations."

- **Every gun fits inside her box.** A hull's size for berths, the bay's
  clearance, docking and collisions is the box her art was normalised to
  (`hullSpan`, the guns the art had included). A fitted weapon is still
  sized against the gun it replaces, and is then shrunk until no part of
  it leaves that box (`render.js gunScale`), so nothing that sizes a ship
  changes with what she carries. A mass driver under a courier's chin now
  comes out about half the length it did; on a freighter it fits whole.
  Wrapped hardpoints stepped outboard are held inside her beam too.
- **The market shows the goods.** Each commodity's row starts with a still
  of its model (drawn once and kept, `Render.drawItemIcon`), and the
  selected one turns in a frame beside the market panel, with its name and
  price a tonne, wherever the window has room for it.
- **The MODULES tab shows the crates.** Every crate row carries its model's
  still; a crate in the catalogue now opens a card, as equipment does on
  BUY: the module turning, its size and how many go to a Crawler cube, its
  days on the slip, what it is for, and ORDER with the reason beside it
  when the yard will not take the order. Esc or a click outside closes it.
- **Racks:** missile, decoy, slug and heat-sink rows carry their models'
  stills too; they still buy on one click.
- **Tests:** guns.test.js, "and inside her box": every gun on every mount
  of every hull model, with three wrapped hardpoints, stays inside the box,
  muzzles included.
- **Saves:** unaffected.

### Added (2026-11-09, Astra's item models: on the yard card, and the guns on every hull)

Astra sent a 3D model for every item on sale (108 of them, `ref/icons/`):
"should be displayed as they are in the description when selecting them in
the outfitters, as well as replacing the current hardpoint placeholders
with these new models."

- **The yard card turns the real model.** `tools/item-models.cjs` turns the
  GLBs into `src/itemmodels.js`: flat-coloured triangles like every other
  mesh in the game. Painted and metal parts take the colour named in their
  material; decals, placards and readouts are cut into small cells coloured
  from their textures, so a hazard stripe or a gauge survives; glows stay
  self-lit. Her models face -Z; the game faces +Z, so they are turned half
  a turn. `Render.drawItemPortrait` draws one turning in the card's square;
  the wireframe stand-in only shows for an item with no model.
- **Guns on the hull are the guns you fitted.** `tools/glb2hulls.js` now
  leaves every modelled gun (`laserPylon`, `laserBarrel`, `laserEmitter`)
  out of the hull and records a mount where it was: where the pylon met
  the hull, which way the hull is, how long the gun was, where its muzzle
  was. 37 of the 57 hull models had guns; their bounds, muzzles, canopy and
  engines come out exactly as before. `render.js armedMesh` hangs the
  fitted weapon's own model on each mount by its base plate, nose forward,
  sized against the gun it replaces, so a pulse laser is shorter than a
  beam and a mass driver longer than both. An empty hardpoint shows an
  acceptor plate with a lit socket.
- **Shots leave that gun's barrel** (`Combat.muzzleOf` via
  `Render.shipMuzzlesFor`): this ship's own mount and the fitted model's
  barrel tip, instead of the courier's two chin guns, which every ship had
  been firing from whatever hull she was.
- **NPCs** fly each hull with a stock gun on every mount its art had, one
  look per family (navy muon pulse, police photon beam, Syndicate beam,
  fighters pion pulse, couriers photon intermittent, the rest photon pulse).
  Hulls whose art had no guns (capitals, carriers, the bulk hauler, the
  runner, the navy's medium and small) get mounts placed along the belly
  when a ship of that hull has guns fitted.
- **Not yet used:** the models for `linpulse`, `linint`, `linbeam` and
  `slipdriveI`-`IV`, which have no item in the game yet; the trade goods'
  and station modules' models (loaded, not shown anywhere yet).
- **Tests:** `test/guns.test.js` (combat group): every item has a model,
  every gun a foot and a muzzle ahead of it, every armed hull a mount per
  muzzle, a ship's mesh is her hull plus exactly what she has fitted, and
  her shots leave the gun on that hardpoint.
- **Saves:** unaffected.

### Fixed (2026-11-09, ship interiors: ceiling lights are lamps, not white wedges)

Astra, screenshots from the Talon's airlock in 1.2.0 "Brian": a white slab
hanging from the ceiling over the ramp.

- **What it was.** Every ship interior lit its rooms with one full-bright
  strip down the ceiling, as long as the room. Drawn without shading, from
  one end it reads as a solid white wedge converging on the far door, the
  same thing the station tubes did before they got separate fittings.
- **Now** a light longer than 1.4 m is laid as a row of fittings along the
  same line, about one every 1.5 m: a bright lens with a dimmer surround
  stepping down towards the ceiling's colour (shipdeck.js `lightRun`).
  Cockpits, passages, lobbies, every room type, the tram platforms, the
  engine room and the lift car all use it. Short lamps and wall lamps are
  unchanged.
- **Saves:** unaffected.

### Changed (2026-11-09, the yard's BUY tab: click to look, buy from the item's card)

Astra: "descriptions are abridged. Change this so that we click on it to
select and view properties, and then a separate 'buy' icon in the
description; this will open a sub-window that describes the item."

- **A row no longer spends money.** Clicking an equipment row on the BUY tab
  opens that item's card instead of fitting it. Rows you cannot buy from
  open too, so you can read about something before you can afford it.
- **The item card** sits over the yard panel: a square portrait of the item,
  turning once every 9 s; its name, price and whether it is grey-market;
  power draw (or power generated, for reactors), mass, slot and every number
  its kind has (damage, range, cycle and damage per second, heat, shield
  capacity and regeneration, misfire rate, a cruise drive's top speed and
  trade-in); the yard's whole copy rather than the clipped pitch; and
  **BUY — <price>**, with the reason beside it when it is greyed (lien,
  shipyard only, no slot, short so many credits). Esc, CLOSE, or a click
  outside the card puts it away; leaving the BUY tab does too.
- **Portraits.** `Render.drawItemPortrait(ctx, x, y, size, id, spin)` is the
  hook for the 3D icons now being made. Until an item has one it answers
  false and a turning wireframe stands in (a barrel for guns, a dome for
  shields and ECM, a coil for drives, a box for the rest), labelled
  "ICON TO COME".
- **Missile racks stay one click.** Restocking Hawks and decoys is a quick
  top-up, and those rows still buy straight away.
- **The icon list.** `tools/catalogue.cjs` writes every purchasable thing (128
  rows: equipment, consumables, hulls, trade goods, station modules, bay
  craft) to JSON or CSV, read from the live tables; `ref/icon-list.csv` is
  today's copy.
- **Saves:** unaffected (`G.yardItem` is screen state, not saved).
- **Tests:** render.test, "the item card": a row click opens the card and
  spends nothing, the card draws with its power line and a close control,
  and CLOSE puts it away.

### Fixed (2026-11-09, station lifts, first pass: the car is sent for her, and she rides on it)

Astra, with a screenshot from inside Meridian Depot: "ship is still not
sitting on the elevator pad, and elevator pad is at the top of the shaft
when ship is being moved from inside the station to the launch pad. The
elevator pad on the cargo lifts must be waiting for the ship by the time
it gets there. The ship must follow a linear path." With it came the larger
request this is the first piece of: station pathing on stacked "graph
paper" (stop, turn, go at corners; diagonals only on a cargo elevator),
shared by NPC traffic. The plan is in the project doc
`claude/station-grid.md`.

- **The car is sent for her, not dragged after her.**
  - **The cause:** the lift you ride on the way across a station (a hoist
    in a cradle, a bore car in a cylinder's arm, a spine's hoists) was drawn
    by `Render.moverPose`. That snapped the car under whichever hull was
    nearest, and otherwise left it where the art put it. So the pad sat at
    the top of its shaft while you drove up to the foot, and then jumped to
    meet you.
  - **The schedule:** the transit now owns the car's schedule (`Sim.moverAt`).
    - The car leaves home so as to be still at your end of the shaft 1.5 s
      before you reach its door.
    - It carries you with the same eased fraction you move by.
    - It stays at the far end until you are through the door there, then
      goes home.
  - **When the car can't make it in time:** if the car cannot get there in
    time (a long shaft, a short drive), you hold at the lift door until it
    does. If it cannot get home before you are on your stand, you hold on
    the stand. So the car never snaps to a position when the transit ends.
  - **Departure:** a departure runs the same pure timeline backwards, which
    is the same promise the other way round. The car comes down and waits
    for you.
- **Onto an inclined car level, and off it level** (her drawing):
  - The corners either side of a 45-degree ride are now out along the
    incline's level heading, at the pad's own height.
  - They used to be out along the rails, so you climbed onto the pad from
    below and drove off it into the air.
  - **Not yet true at the cylinders' arm bores.** Their tubes are closed at
    the ends, so a level approach is re-routed round the tube and still
    arrives at an angle (about 50 m of drop on the last leg). The bore ends
    need opening level, with the recess at the foot and the flush landing at
    the head that her drawing shows. That is the next pass, along with the
    pad being drawn level.
- Tests: `test/lanes.test.js` (new, in the `transfer` group). It runs over
  every orbital model whose routed berths ride a lift, and checks that:
  - every car is at your end, still, before you drive onto it;
  - no car jumps;
  - no car moves while you board or alight;
  - your height over the car's deck never changes on the ride, and you are
    over the car, not beside it;
  - inclined cars are driven onto and off level. This check fails, on
    purpose, at the cylinder bores above until their geometry is fixed.
- **Saves:** unaffected. Nothing new is stored, and the transit is still a
  pure function of the time since it began.

### Fixed (2026-11-04, level pads in the tilted bays: a deck as flat as any other, built out from the slope)

Astra, of the 30 berths the fourth pass left with no level floor: "For
sloped interiors build a landing pad which extends out from the angle,
making it as flat as any of the other."

- **Every tilted bay has a level landing pad.** The cylinders' arm B and C
  pods and their heavy arm bays (rolled 60 degrees round the hub), the
  Syndicate yards' five garages (22 degrees) and one of their roof throats
  (10 degrees) had nothing level in them: every hull stands +z up, so the
  hull was parked in the air 30-990 m over the slope, or in a garage's
  doorway with the open hall behind her. Each now has a pad: a level slab
  as thick as a floor plate (0.0016 radii, 2-11 m), square, big enough for
  the longest hull at the smallest station a model is given (17.5 m either
  side of her middle at 1.25 km), with a skirt under its edge, struts from
  its corners and edges to the slope or wall it is built out from, a
  hazard rim and lamps. The stand sits on it on a plinth, square to the
  pad (it used to be built along the bay's own tilted normal: a tilted
  plate), and the gallery and lift shafts a level bay has along its back
  wall are left out, since in a bay tilted 22-60 degrees they hung in the
  air.
- **Measured, not modelled.** The pads are generated from each model's
  own triangles when it is loaded (`Render.levelPads`): which bays need one
  is the level-floor sweep's own three questions (nothing under the deck
  reading, no headroom over it, or a floor lower in the bay with most of
  the bay clear over it), asked only where the bay's frame is tilted, so a
  ring's heavy bay is left alone. Where it goes is searched for, nearest
  the old stand first: the slab and a hull's clear height over it may
  cross no triangle and no door leaf's box as far as the leaf runs, the
  pad must be in the bay's own room and in sight of it, and at least two
  struts must reach structure. No seed, no draw and no art re-export: a
  pure function of the model and the berth. The pad is appended to the
  shell before anything reads it, so it is drawn, collided with, voxelised
  into the solidity grid and routed round like the rest of the station.
- **Up beside the pad, then across onto it.** The cylinder pods are
  reached from their bore's car through an opening in the pod's floor, and
  a pad over the opening was a lid on it (cylinder-m b1: no open route
  found). There the pad is put beside where she comes up, by her own
  half-length, and the rail brings her up there and slides her level onto
  it (`Sim padLanding`).
- **She stands level on it.** A docked hull faces along her bay's normal
  (`Sim.berthFacing`), and in a tilted bay that pitched her 10-60 degrees
  nose-down into the slope (or nose-up in a garage). On a pad she faces the
  normal's level part (`Gen.berthOffset` marks the berth `level`), docked
  and on the rail in.
- **The garages' arrivals stay indoors.** Their stands were in the open
  hall just inside the door, which the occupancy grid counts as open space
  (it is open to it at the hall's ends), so the hull went in through the
  doorway's cut and back out to stand. Each stand is now on a pad built out
  from the leaning wall just inside the door; the pad is structure, the
  doorway's cut runs through it, and the stand reads as in the doorway.
- **Cost.** Placing the pads is done once per model, when its art is first
  built (`libPort`): about a second more for a cylinder or a Syndicate
  yard in node (cylinder-m 0.23 s before, 1.3 s now; yard-syn-l 0.28 s,
  1.4 s), 0.1 s for a ring, whose tilted heavy bay is read and needs none.
  It is paid in one frame, not sliced like the deck and route jobs, and
  that is still owed.

Measured (the sweeps in berths.test.js and interiors.test.js):

- Berths off a level floor: 30 before, 0 now (the test is tightened to 0).
- Cradle and Syndicate-yard arrivals that go indoors and back out: 3 of 72
  before, 0 now (tightened to 0).
- Berths with an inner leg through structure: 0 of 166 before, 0 now.
- Approaches through something: 0 of 166 before, 0 now.

**Saves:** survive. Nothing stored changed: the pads, stands and routes are
worked out from the model each session. A ship saved docked in a tilted bay
is re-docked on load (`Sim.dockShip`, as always), on her pad.

### Changed (2026-11-04, the economy retune: narrower spreads on dear goods, lots priced down the shelf, the jump pays more, bigger hulls dearer, a bigger hard-start purse)

The 2026-11-03 measurements: a hand-flown Talon cleared about 32,000 cr a run,
the best 64 t run inside a home system about 133,000, and a Tallyman cost
72,000, two or three runs. Asked whether to bring a run down to 20–40% on
what you spend, Astra chose **"both, milder"**: narrow the spreads somewhat
and make deliveries move prices harder; raise the bigger ships' prices
somewhat; keep longer trips paying more than short ones.

- **Measured first** (`tools/measure-economy.cjs`, new: `runs`, `wear`,
  `tutorial`, `ships`, `climb`). Every lot is **walked** tonne by tonne down
  both shelves through the real quote, and the buyer stops at the tonne that
  no longer pays. Where the spread came from: `base × local × scarcity`
  counts the same fact twice. A major exporter is cheap by structure and also
  sits on a full shelf, and a hungry importer is dear by structure and also
  sits near empty, so the best pair in a system bid 2.4–5× its ask, the same
  for every good. Every best run was high-tech (AI cores, fusion, robotics,
  luxuries, gene therapies, computers, fissiles) and waste never was.
- **Spreads narrow with value per tonne** (`economy.js`, `quote`,
  `VALUE_REF` / `VALUE_SLOPE` / `VALUE_KMIN`). The price structure is
  raised to a power `k = 1 − 0.4·log10(base/200)`, floored at 0.4. What
  lets a price differ between two places is the freight, and freight is per
  tonne: it is most of what water is worth and almost none of what an AI core
  is. So staples (≤ 200 cr/t) keep their whole spread, and they are what a
  3,200 cr Talon can afford to fill a hold with. Farm machinery keeps k 0.85,
  fissiles 0.72, robotics 0.64, fusion 0.60, luxuries 0.56, AI cores 0.47. A
  power, so every ordering and every sign is kept. **Military fuel and
  contraband are exempt**: under the floor exponent milfuel's best run fell
  from 22,565 to 5,229 cr, below a waste run. Its shelf rations it, and
  contraband's spread is the price of the risk. Waste is priced on its own
  path and is unchanged.
- **A shortage next door is a short haul** (`nearSupply`, run once after the
  signatures). An import worth over 200 cr/t that another port of the same
  system exports keeps a quarter of its premium. One the system cannot supply
  keeps all of it, because only a jump can fill it. No draws.
- **The desk prices a lot down the shelf** (`Economy.lotPrice`; `main.js`
  trade). The terminal used to charge a whole lot at the board's first-tonne
  price, so the dent landed only on the next trade. Splitting a lot into
  single tonnes already got the walked price, so the board price was a
  reward for pressing Home. Now a delivery moves its own price: the trading
  houses always priced this way. A purchase is cut to what the money covers,
  priced first and committed after. **This replaces the trading-house entry's
  "your trades at the counter are exactly as they were."**
- **Price marks re-measured** on the new distribution (sixty home systems,
  quartiles and twentieths, the same method reproducing the old constants
  within a few hundredths). Ask green from 0.79× (full 0.61×), dear from
  1.01× (full 1.77×). Bid green from **1.17×** (was 1.34×, full 1.57×), poor
  from 0.81× (full 0.60×).
- **Bigger hulls dearer** (`combat.js` HULLS): Tallyman 72k → 110k, Mule
  78k → 135k, Kestrel 120k → 150k, Longhaul 165k → 250k, Tanker 150k → 220k,
  Crawler 450k → 560k, Meridian 420k → 500k, Leviathan 600k → 780k. The small
  hulls (Talon, Dart, Bollard, Sump, Lance, Wren) and the combat and
  specialist hulls are unchanged. Trade-in, resale, the start presets' cash
  (start.js rule 2) and a house's insurance all follow the list price.
- **The trading houses' depth re-swept** (`tradingfirm.js` `TUNE.depthMul` 4 →
  1.7). At x4 on the new margins, rating 1 lost in 98% of quarters and rating 2
  in 86%. The sweep, rating 1 / rating 2 losing quarters: x1 9/0%, x1.4 27/8%,
  x1.6 45/6%, **x1.7 53/16%**, x1.8 63/22%, x2 64/38%, x3 91/72%. x1.7 puts
  both back near where x4 had them (62/12%).
- **Cargo contracts pay three quarters** (`missions.js` `CARGO_PAY` 0.75:
  haul, courier, disposal). The fees are flat tables, so the retune left them
  worth 2.5–3× more next to trading. 0.75 instead of the ~0.35 that would
  restore the old ratio, on purpose: the hard start took the biggest cut, and
  capital-free work is what a pilot with no capital lives on. Passage (it
  needs a 14,500 cr habitation unit) and the navy's licensed fuel haul are
  unchanged.
- **The hard start's purse is 7,000 cr** (was 3,200; `generate.js`
  `SHIP_SPEC.credits`, now the only place it is written). The retune cut
  Halloway's first run from 3,338 cr median to 1,265, because a first hold
  is ROI-bound: the purse buys a few tonnes of the best good, so any
  narrowing lands on it in full. Astra chose **both** remedies offered: a
  bigger purse, and a gentler near-supply rule for cheap goods. start.js
  (`classicCredits`, the HARD row, the after-lessons profit), `sim.js`'s
  new ship, `measure-economy.cjs` and the tests all read the purse from
  there; FLIGHT-CARD says 7,000. Swept on the tutorial's 39 openings, with
  the ramp below: 5,000 → 2,133 median, 6,000 → 2,675, **7,000 → 2,940**,
  8,000 → 3,350. Rule 2 is untouched (each focus at a difficulty is still
  worth the same), and Hard is still the poorest start by worth at list:
  45.3k, against Normal 71.4k and Easy 138.8k. One oddity, noted in
  start.js and left: the Normal Bollard, the dearest Normal kit, carries
  the bare 6,000 floor in cash, 1,000 less than a Hard Talon. She is
  26k richer in worth, all of it in a mining hull.
- **Near supply ramps in instead of switching on** (`economy.js`
  `NEAR_HI` 700, `nearKeep`). It was a hard cut at 200 cr/t: chemicals
  (210) kept a quarter of their premium, textiles (190) all of it. Now the
  share kept falls with log value from all of it at 200 to the quarter at
  700: alloys keep 0.83, farm machinery 0.48, rare earths 0.30, and
  fissiles and everything dearer get the full rule as before. The ramp
  mostly lifts the **worst** first runs: at a 7,000 purse, p10 507 cr with
  the cut and 1,426 with the ramp. Ramp tops swept: 500, 700 and 1,000
  left the best in-system run at 42–43% median; 2,000 put it at 54% and
  5,000 at 62%, giving the mid game back what the retune took. 700 is the
  top of the range that moved nothing past the first run.
- **Waste runs left as they are** — Astra's choice ("leave it"). A waste
  run still pays 8.9k median with no outlay. It was about seven times a
  new pilot's first trade run at the 3,200 purse; with the first run now
  2,940 it is about three times, where it was before the retune.

**The numbers** (40 seeds, home system, t = 10 days, unless noted):

| | before | after |
|---|---|---|
| best in-system run, 64 t, walked: profit (median) | 103k on 64k | 31k on 84k |
| — return on outlay p10 / median / p90 / max | 66 / 160 / 217 / 263% | **20 / 42 / 60 / 76%** |
| — the same run at the old terminal's board price | 138k, 161% median, max 312% | (no longer charged) |
| best run to one of the 3 nearest claimed stars, walked, less jump hydrogen | 126k, 151% median | 43k, 44% median (p90 87%) |
| — next door / at home, per seed, median (p10) | 1.22× (0.82×) | **1.34×** (0.84×) |
| waste run in-system (paid to load, fee to dump) | 8.9k median | 8.9k (unchanged) |
| milfuel run in-system (97 systems, 6 stars a seed) | 22.6k median | 22.6k (exempt) |
| the best lane flown again, one round trip a day: runs 1–4 | 100 / 56 / 22 / 8% | 100 / 30 / 4 / 3% |
| **Halloway's first run** (39 openings, 3,200 cr Talon): profit, median | 3,338 (min 0, max 7,972) | 1,265 (min 137, max 2,997), on 3.1k |
| — with the 7,000 cr purse and the near-supply ramp: median (p10 / p90) | | **2,940** (1,426 / 5,508; min 137, max 7,366), on 6.7k |
| the hard start to a Tallyman, best affordable run twice a day, lanes wearing | 3 runs | 8 runs; **6** from 7,000 cr |
| haul / courier contract pay, median | 696 / 3,309 | 522 / 2,482 |

**The yard in runs** (a "good run" is the best mixed hold a hull can carry
from home, in-system or next door, jump hydrogen paid; a step is the next
yard price less 70% of the hull you arrive in):

| step | old economy, old prices | new economy, old prices | **new economy, new prices** |
|---|---|---|---|
| Talon → Tallyman | 0.5 | 1.4 | **2.2** |
| Tallyman → Mule | 0.2 | 0.6 | **1.1** |
| Mule → Longhaul | 0.5 | 1.7 | **2.3** |
| Longhaul → Leviathan | 1.5 | 5.9 | **7.3** |

A good run is now 45k on a Talon, 64k on a Tallyman, 77k on a Mule, 86k on a
Longhaul and 92k on a Leviathan (it was 137k / 201k / 250k / 326k / 368k). A
bigger hold earns much less than its size suggests, because a lane walks its
shelf flat long before 300 t. That is why the big hulls went up "somewhat"
and not by their tonnage.

**The trading houses** (`tools/measure-firms.cjs quarters 20 4`, each quarter
a fresh 50,000 cr account, a Talon, a rating-3 pilot; 64 quarters a line):

| | before (x4) | new economy at x4 | **after (x1.7)** |
|---|---|---|---|
| hand-flown baseline, median quarter | 20.3M (664 runs, fresh run 34k) | 5.88M | **5.88M** (548 runs, fresh 12k, repeat 8.6k) |
| rating 1 | −14k, 59% losing | −44k, 98% | **−4k, 53%** |
| rating 2 | +95k, 6% | −32k, 86% | **+105k, 16%** |
| rating 3 | +1.04M | +212k | **+448k** |
| rating 4 | +1.22M | +295k | **+592k** |
| rating 5 | +1.28M | +349k | **+674k** |

A good house's quarter is now about a tenth of the hand-flown ceiling (it
was about a twentieth). Both came down with the margins, and the house's own
extra depth came down from 4x to 1.7x so that its bottom ranks stay a bad
bet and a risky one rather than a certain loss.

**The first run, decided** (Astra, 2026-11-04: both remedies; waste left
alone). The purse and the ramp, before and after, 40 seeds as above:

| | retune, 3,200 cr, hard cut | **7,000 cr, ramp to 700** |
|---|---|---|
| Halloway's first run, walked: median (p10 / p90) | 1,265 (331 / 2,540) | **2,940** (1,426 / 5,508) |
| — the purse alone (7,000, hard cut) | | 2,735 (507 / 5,508) |
| — the ramp alone (3,200) | | 1,389 (370 / 2,574) |
| best in-system run, 64 t, walked: return p10 / median / p90 | 20 / 42 / 60% | 20 / 42 / 60% |
| — its profit, median | 31k | 31k |
| next door / at home, per seed, median (p10) | 1.34× (0.84×) | 1.34× (0.84×) |
| runs per step: Talon→Tallyman / →Mule / →Longhaul / →Leviathan | 2.2 / 1.1 / 2.3 / 7.3 | 2.2 / 1.1 / 2.3 / 7.3 |
| the best lane flown again, runs 1–4 | 100 / 30 / 4 / 3% | 100 / 30 / 4 / 3% |
| the hard start to a Tallyman | 8 runs | 6 runs |
| waste run in-system | 8.9k (7× the first run) | 8.9k (3×) |

The mid and late game did not move: every line past the first run is the
same to the percent, and the yard's good runs moved by under 1k (a
Longhaul's in-system run 56k → 57k). Cargo contracts stay at 0.75; they
are still worth having beside a first run of 2,940.

**Saves:** survive. No field added or removed and no version bump. An old
career keeps its credits, cargo and hulls; prices are simply what they are
now. The bigger purse is for new careers only: a career saved before this
keeps the money it has, and nothing tops it up to 7,000. A system's
near-supply shares are worked out when it is generated, so an old save
gets the ramp the next time a system loads. A hull bought at the old price trades in at 70% of the new list price.
A market's ledger (the player's footprint) keeps decaying as before.

### Fixed (2026-11-04, station geometry, fourth pass: every leg inside a station in the open, the navy yards' heavy bays on their hall floor, the Syndicate yards' throats on their floors)

Astra, of what was still open after the third pass: "let's do all the still
open stuff".

- **The cylinders' small bays ride their arms in the open.** Cylinder arm A
  is the builder's arm rolled half a turn round the hub, and its bore came
  out upside down: keel, racks and car on top, crown underneath. The hull,
  stood on the car's deck, rode the whole bore *inside the keel slab* - and
  a line inside a slab crosses no surface, so every sweep passed the ride
  and failed the legs on and off it. The converter now turns such a bore
  half a turn about its own axis, keel down (`tools/glb2hulls.js`
  boreUpright; the tube is symmetric, so the hub's and pod's holes for it
  are unchanged). All nine cylinders re-converted.
- **On and off an inclined car along its rails.** The leg to a car parked in
  a bore's mouth came in through the bore's side wall; the route search had
  to find the mouth on a grid as coarse as the bore is narrow, and at arm B
  it never did. She now drives out along the rails past the end of the run
  and straight onto the car, and off it the same way (`Sim` seatRide).
- **The skimmers' hoist has a way out at the top.** The field between the
  hoist and the sort hall is called `hallGateForceField`, and anything
  starting `hall` went into the interior bucket, where nothing makes a gate
  into a door: it was a solid plate. A field is now never interior. The
  station's own internal doors (the skimmers' lock and hall gates) open for
  a transfer passing through (`Render.hallLeafOpen`); before, they opened
  only with a berth's outer doors. Nine skimmers re-converted.
- **No elevator through the walls.** Where the converter could not join a
  small bay to a heavy one it drew a straight "elevator" between them,
  through whatever was in the way, and at the game's own collision test
  every such route stayed one. Those bays - the cradles' outboard pods,
  which hang off the hull with open space between, spine-l's two, every S/M
  bay at the navy and Syndicate yards, and one at cylinder-m - now dock at
  their own doors, and the anchor says why ("no passage from a heavy bay").
- **The navy yards' heavy bays.** Their doorway is set 0.19 radii up the end
  wall of a hall whose floor is far below, with nothing to stand on in it,
  so the hull was parked on the lintel with 613-700 m of nothing under her
  and the rail flew in over the lintel into the wall. The stand is now on
  the hall floor inside (`Render.berthStandIn`), with its pad; she comes in
  level through the middle of the doorway, then down, and leaves the same
  way back (the rail run backwards, as from a routed bay). The doorways'
  roll-up slats also stood a strip of shut door, the doorway's full height,
  in the middle of every open garage: a face lifted off a coplanar panel
  fell outside its slat's rounded box (`inGateBox` pads a leaf's thin axis).
- **The Syndicate yards' throats.** Six S/M bays were parked on the roof of
  their slot, outdoors, 86-101 m over its floor; the lintel rule now covers
  the top fifth of a bay's box, which moves exactly those six. Their doors
  lean 10 degrees, and the line in is now kept on the door's own plane
  where it is moved to her height (it had stood the hull in the shut
  leaves).
- **In transit with the cutaway outside, the station is drawn.** Checked at
  Halden Yard on this branch: since the third pass's rooms (`Render.roomAt`)
  the whole hull is drawn round her on the transfer, cut by the cone only.

Measured (Waypoint Dock's radius, the navy and Syndicate yards included in
every sweep, which the inner-leg sweep had always said it did and did not):

- Berths with an inner leg through structure: 58 of 166 before, 0 now
  (32 of 131 without the yards).
- Approaches through something: 6 of 378 before (17 of 60 at yard-navy with
  its routed bays), 0 now.
- Berths off a level floor: 40 before, 30 now. All 30 are bays whose own
  frame is not level: the cylinders' arm B and C pods, rolled 60 degrees
  round the hub, and three Syndicate garages, 22 degrees. Every hull stands
  +z up, so there is no level floor in them; that is the art's to mend (or
  a tilted stand's). Every level-framed bay now stands on a real floor.
- Cradle and Syndicate-yard arrivals that go indoors and back out: 24 of 72
  before, 3 now - those three tilted garages, whose stands are outdoors.

**Saves:** survive. Nothing stored changed: routes, stands and doors are
worked out from the model each session. A ship saved docked is re-docked at
that port on load (Sim.dockShip, as always), at the stand as it is worked
out now.

### Fixed (2026-11-03, station geometry, third pass: Halden Yard's carriages ride, a clean landing at the small spines, ground ports on her own gear)

Astra, of what was still open after the second pass: "let's do all the still
open stuff".

- **Halden Yard's "elevators" are carriages that move.** The civil yards'
  S/M bays sit on 45-degree carriages, stored above the hall's crown or
  under its floor, and nothing ever moved them: the carriage stayed parked
  in its storage level, and a hull bound for one was carried up the incline
  through it to stand on the *rail* above (0.36 radii up at yard-m, a
  quarter of a radius over the carriage's own deck). Each carriage is now a
  car with faces of its own (`tools/glb2hulls.js`: the bay group's declared
  `carriage` run, claimed face by face so the rail its bogie rides stays
  put). It comes down to the hall while she crosses to it, she drives in
  through its door, and it carries her up to her stand on its deck; the
  carriage and the hull never part (swept every half second of the ride).
- **Flush with the floor, and covered when it is away.** The art's own run
  stopped every carriage in mid-air: the upper ones' deck 0.017 radii over
  the hall floor (about 90 m at Halden Yard), the lower ones' 0.0075 (40 m),
  "too high on the right and too high on the left". Each run is now fitted
  along its incline (`Render.fitCarriages`) until the deck lands level with
  the floor beside the aperture; the lower carriages come up into the floor
  and lock there. The track leaves over each aperture were welded into the
  hall's interior mesh; they are moving parts now, shut while the carriage
  is home and open from the moment it leaves, so when it is not there the
  shaft is covered. The cargo cars beside them keep their leaves shut.
- **Spine-m takes a clean landing at its small stations.** At Marrow
  Platform (2.30 km) and Waypoint Array (2.18 km) a clean seat in berth 0
  docked nothing, and had since af2b08b. A curtained bay's box is its force
  field's sheet, 0.002 radii through, so the bay measured 4.4 m deep there
  and a courier (8.6 m) "did not fit" her own bay. Curtained bays are now
  measured by the art's own `hangar` depth (`Sim.curtainDepth`). The same
  measure was sending every small hull to the heavy bay at stations under
  about 3 km; she now gets the small bay she was meant to, routed through
  the heavy one as at the larger stations.
- **Ground ports stand her on her own gear too.** They kept the old half
  metre over the berth's standoff, which at Harrow Deep put a Talon's gear
  2.3 m into the floor and the Tanker's 9.3 m. The walkable hangar was
  never the obstacle: it is built in her own frame on her own gear, so it
  moves with her (the hangar view is identical before and after). What went
  red was a render test's camera, whose angles were converted into the
  ground's frame on the first frame and came out pointing the boom into the
  floor; it now sets its shot in the ground's frame. Sea pads keep the half
  metre: their stand is the pad's own table, and her feet have not been
  measured against it.

Measured with interiors.test.js's sweep at Waypoint Dock's radius: berths
with an inner leg through something, 52 of 131 before, 32 now; every one of
the 20 yard S/M bays was among them and none is now.

Not done yet, with what was found:

- The cylinder bores' hub mouths (B) are not cut; their berths, the
  skimmers' hoists, spine-l b0/b2 and four cradle bays make up the 32.
- yard-navy's 17 approaches (C): every one runs into the wall over its
  heavy bay's door. The heavy bay is a doorway 0.19 radii up the wall of a
  hall with no floor behind it; `Render.berthDeck` finds nothing in the
  bay's box and falls back to the box's top, the lintel, and the rail flies
  in at that height. It wants a stand on the hall floor and a way down to
  it.
- The berths off a level floor (D) and the cradle and yard-syn arrivals
  that go indoors and back out (E) are unchanged.

**Saves:** survive. Nothing stored changed: carriages, runs, stands and
routes are worked out from the model each session, and a ship saved docked
in a yard bay loads on her carriage's deck.

### Fixed (2026-11-03, the open UI items: labels that overprinted, a lent bay that was forgotten, a hull on her tail, the sea's glint and domes)

Astra: "let's do all the still open stuff." Each of these was seen in a
screenshot, and each was looked at again after the fix at 800 × 600 and
1280 × 720/800.

- **Halloway's lesson strip leaves the page's name showing.** On a full-screen
  page the strip started 170 px in, which covered any title longer than
  COMMS. On F6 you could read only "GALAXY MAP & COU". Each page now records
  where its title ends (`screens.js` `modeFrame`), and the strip starts after
  that.
- **The galaxy chart's two always-shown names pick a clear side.** At the
  whole-galaxy zoom, "Mirven" and "Rhoameor" are always named, and they used
  to take the first spot that did not touch another name, whatever stars lay
  under it. Now they try sixteen directions at five distances and take the
  spot with the fewest star dots and territory border under it. The two are
  placed together, so one cannot take the only clear spot the other had (on
  kawartha they are 4 px apart). A name placed further out gets a thin line
  back to its star.
- **On foot, labels stay off the room title and the "E — use" prompt.** At the
  trade terminal, looking down, the terminal's label (set 2.4 m up) landed on
  the room title. A label that would hit either one now moves clear instead
  of vanishing (`walk.js` `labelClear`). The room title also has its own dark
  plate now. It used to be pale cyan text on whatever was behind it, and on
  the concourse's yellow sign it could not be read. Walk labels have a dark
  outline too.
- **In the cockpit, planet names stay off the readouts.** A planet just below
  the nose printed its name across PITCH / ROLL / REF. `Render.hudReadoutBoxes`
  gives the areas used by the heading tape, speed and altitude boxes, the
  attitude line, the facing cue and the key-hint line. These are worked out
  from the same numbers the HUD itself uses, and a test checks that every
  readout falls inside them. A label that would land on one moves above or
  below it.
- **The intercept pip's label keeps off the readouts too, and the locked
  target is named once.** With the pip just under the nose, "PIP 17.0 min"
  and its drive line printed through PITCH / ROLL. Both lines now move
  together, up or down, using the same boxes (`labelOffReadouts`'s new
  `extra`, the height of the second line). The nav lock and the docking
  target were named twice: once by their box on the glass, with the range,
  and again by the world's own label a few pixels away. In the cockpit the
  box's label is now the only one (`holoNames`).
- **Ships' names in a crowded berth stack instead of overprinting.** A ground
  port's pit with three ships berthed in it printed three names on one spot
  (Terminus Downport, Cydoren). Ship names are now placed like planet names
  (`Render.stackLabels`): they keep off the names already drawn, try the rows
  just above and below, and a name with no room left adds "+1" to the name it
  lost to.
- **A ship saved in a lent heavy bay reloads in it.** `ship.lentBay` (set when
  every small berth was full and the port lent you its heavy bay) was not
  saved. On reload `assignBerth` treated you as a normal arrival and parked
  you in a small berth your hull does not fit. It is now saved and restored
  before the ship is docked.
- **No hull stands on her tail at a sea rig.** Heavies (`outboard`: they lie
  off with lighters working them) never get a pad, and a boat based at a port
  has no route. At a sea platform both fell through to the open-pad pose:
  nose up, in the middle of the rig. That is where the "Ironwake Packet" was
  seen. They now hold off the rig, level, as a ship turned away from a full
  deck does. The holding pose also carries its level heading (`rest`), so a
  ship arriving to hold no longer tips nose-up for its last few hundred
  metres. Over 71 kawartha systems this was 70,473 of 2.27 million samples
  near a rig. Now it is none.
- **The sun's glint on the sea is easy to see.** Gain 2.2 → 4.5 in `gl.js`
  `seaShade`, chosen after trying 2.2, 3.5, 4.5, 6 and 9. At 2.2 the
  brightest point of the sun's reflection never got near its 0.85 cap (0.58
  for a low sun, 0.33 for a high one). At 4.5 it reaches the cap under a low
  or middling sun and 0.67 under a high one. At 9 the distant glint looked
  like a second sun. The cap is unchanged, so the glint still cannot blow
  out.
- **The tube's windows show rings and lightning.** Rings, tears and lightning
  bolts are drawn in passes after the mesh pass, and the windowed room clears
  depth before it draws the deck. So those passes were hidden behind the deck
  and the panes. They are now drawn at the depth clear, before the room.
- **Dome crowns keep their shape under a high sun.** A plate facing straight
  up gets the sun's full strength plus the light from the whole sky, so the
  crowns were the palest part: 161 of 255 against the shoulder's 154 at
  Linis's Low Strip with the sun 72° up. The petal rows are now toned from
  0.80 at the crown to the plate's own grey at the foot. The crown now reads
  128 against 140, darker than the shoulder.

Not fixed: the **torn strip at the top of Terminus Downport's pit** did not
show up. I looked at six Terminus Downports in kawartha from above, from the
pit's rim, at a grazing angle and from inside the berth, with the cutaway on
and off. All I saw was the cut's intended scorched edge. A screenshot of the
tear, or the seed, port and camera, would let it be found.

**Saves:** survive, version unchanged. One optional field was added:
`ship.lentBay`, a port id or null. A save from before it loads as "not lent",
which is what it was.

### Changed (2026-11-03, the pip takes the faster drive)

Astra found the pip saying "thrusters, too close for the drive, 17 min" at
2,900 km off Threshold Dock. The cruise drive does that trip in under a minute,
even at its 60 km/s floor. The cause was a 5,000 km threshold, auto-dock's
`AUTO_CRUISE_MIN`, which decided the drive by distance alone. She chose: "let
the pip work out both and take whichever is faster."

- **Both drives are solved, and the faster one is kept** (`Intercept.solve`).
  When the drive is allowed, cruise is solved first, then thrusters. The
  thruster solve gives up once it has taken ten times the cruise time, so a
  long crossing no longer pays for a thruster solve it would throw away.
- **The readout says what it chose and what the other drive would take**:
  `cruise  (thrusters over 6.0 min)`, or `thrusters · faster than cruise
  (cruise 2.1 min)`. *too close for the drive* now appears only under the
  floor (below).
- **The intercept assist flies the drive the pip chose.**
- **The cruise time now includes the drop-out miss.** The drive is dropped on
  the frame the gap falls under one step at its floor speed. Measured from
  2,900 km at 20 fps, that left the ship 5.7 km short and added 38 s of
  thrusters to a 53 s trip. Without the miss in the model, cruise came out
  faster than thrusters at any range.
- **A measured floor of 18 km.** That is twice the worst drop-out miss: one
  step at 60 km/s with 10 fps frames, times the 1.5 safety factor. It is
  raised further for a target the drive has to outrun. The modelled
  crossover was 1.1 times the miss in every case: 1.6–1.9 km at 60 fps, and
  9.3–10 km at 10 fps, for thrust from 0.002 to 0.019 km/s².
- **Auto-dock keeps its 5,000 km rule, deliberately.** From the same 2,900 km
  it reaches its berth phase in 27 s of wall clock, against the assist's 22 s.
  It flies on thrusters but winds the clock up to 500×, so the player waits
  about as long either way. Its long leg hands over at its lead point and
  hails the port. Rewiring that tested approach for 5 s is not worth it.

**Saves:** unaffected.

### Added (2026-11-03, trading houses: a factor on the concourse, an account for your ships, judged by the quarter)

Astra: "Is there a way for me to tell my fleet to go buy low and sell high on
commodities X, Y, Z etc, and actually give the ship a budget, if it increases
the budget, the captain stays on. NPCs would need a mercantile skill?" Then:
"we can add another NPC type, they're kinda like the fixer, but civilian, and
their job is a combination of economist and import/export company"; for other
systems, "both"; and "Trading firms measure their traders by the quarter year."

- **A trading house at bigger civilian ports** (`src/tradingfirm.js`). Its
  **factor** stands beside the trade terminal on the concourse (a new `factor`
  role, a civilian in a suit, with its own portrait leanings). Whether a port
  has a house, and what the house is, is a pure function of the system's seed
  and the port, on its own hash, so no other draw moves. More likely where the
  port is developed, its lanes busy and the law clean; never at a Navy or
  Syndicate port, a plant, a milfuel works or a carrier. **Measured over 30
  seeds × the 6 nearest claimed stars (2,690 ports): 1.34 houses a system, at
  12.5% of civilian ports; 64% of systems have at least one.**
- **The house's mercantile skill is its rating, 1–5** (measured 14 / 27 / 22 /
  24 / 12%). It decides how good the house's information is:
  - **1–3 read boards**: the other ports' prices as they were 5, 3 or 1.5 days
    ago (plus a corridor's age for another system, the trade analyser's own
    `reportAgeDays`), with a clerk's error of 10, 7 or 4.5%. From 3 the house
    prices its own size against the shelf (a 40 t lot moves a price).
  - **4–5 read forecasts**: the market at the hour the hull will arrive (4
    halfway there), and they see **your own fleet's footprint** in a market,
    so two of your hulls do not both pile into one glut. Lower houses see a
    quarter or half of it, or none.
  - Better houses get a better price at the desk (up to 1.6%), run more hulls
    (1–5), charge more commission (8, 10, 13, 17, 22% of a quarter's profit,
    a seeded half-point either way) and set a floor: **a first-rank house
    will not open an account under 50,000** ("Not worth our time under
    50,000."), a serious one under 20,000, a sound one under 5,000.
- **The economist: a paid market reading** (120–900 cr by rating). For the
  goods in your hold, or the port's exports if it is empty: which are rising
  over the next three days and where (this system and the nearest others),
  with a confidence that is the house's rating, less distance.
- **Import/export: an account.** At the desk, a deal sheet: a budget (5,000 to
  1,000,000, clicking past the house's floor and your purse), any of your
  ships in this system with a pilot aboard, and a goods list (or the house's
  choice of anything honest). **The budget becomes the account**, separate from
  your credits: every buy, sale and tank of jump hydrogen the house makes comes
  out of and goes into it. A bad house can lose its budget, never more. Profit
  stays in the account, so the budget grows; you withdraw the profit, deposit
  more, hand over another hull or close the account at the house's office.
- **The runs are a timetable**, booked closed-form like every other ship of
  yours under orders: she sits at a port until a decision instant, buys,
  casts off after a turn at the clamp (12 h between two ports of one world,
  1.5 days across the system, 2 days before a jump — the lanes' own layovers),
  and sells the instant she arrives. In-system legs are drawn and heard as
  your traffic. **Between stars** the leg is clearance, `Galaxy.jumpSeconds` at
  her laden mass, and a cruise in from the drop; the hydrogen is bought out of
  the account. Houses trade into the 1–4 nearest claimed stars by rating.
  Nothing to carry: she runs empty to a better port in the system, or waits a
  day. Every house remembers a losing run and keeps that good off that port
  for a week.
- **Every quarter (91 days)** the account's equity — cash, plus what the loads
  aboard cost — is put against where the quarter began, less what you moved in
  or out. **A profit renews it, and the house takes its commission. Anything
  else ends it**: you drop them, or a first-rank house with a small account
  drops you. Hulls on a run finish it and stand down; the balance is remitted to
  your credits when the last is home. Said, and written in the journal.
- **Booking is exact and idempotent.** All runs of all houses go through one
  queue in time order: one call or sixty, this hull first or that, the
  accounts come out the same to the credit, and booking twice books nothing.
  The house prices off the market's closed form plus **its own footprint**,
  which it keeps and which is saved, so a reload trades exactly as no reload
  would have; its trades also dent the real market, so you see them at the
  counter.
- **The FLEET tab's "1-11 of 13"** no longer sits under the FITTING button: it
  goes on the budget bar when there is room before the tabs, and at the foot of
  the list, right-aligned, when there is not.
- **F5 → FLEET** shows each account (worth, this quarter, the review, last
  quarter's verdict and commission, cash) and each traded hull (her run, ETA,
  her runs and what she has made the account). Her hail reports the run.
- **Refusals in words** everywhere: no house here; no ships; the book is full;
  no budget; under the floor; you cannot cover it; nobody aboard can helm her;
  she is in another system; under way; working a site; held by the harbour; a
  partner's ship; cargo aboard; a contraband good; an account already open; a
  hull already trading; withdrawals only at the office; more than the cash;
  under the floor while open; a deposit you cannot cover. A traded hull cannot
  be ordered, set to work or taken command of until she stands down.
- **Running costs, out of the account** (Astra: "costs + market depth"). The
  crew's wages by the day (`Crew.dailyWage`; the payroll at your desk stops
  charging you for a hull from the hour she is handed over, and starts again
  when she stands down); **a berth at every stop**, the fleet's own weekly fee
  by the day at the clamp, a day at least (the old exemption is gone);
  **insurance**, 0.08% of the hull's list price a day out of port and 2% of the
  load per run; and the jump hydrogen as before. Reaction mass is not charged,
  because nothing in the game charges for it. What the account cannot cover is
  owed, taken from the next sale and counted off the equity; **an account with
  nothing left closes** ("the account is empty"), so a house can still lose its
  budget and never more.
- **Market depth, for the house only.** Your trades at the counter are exactly
  as they were. The house's own book carries its lots **4x as deep per tonne**
  as yours and remembers them **16 days** against the market's 4. Both were
  measured on the same seeds (`tools/measure-firms.cjs depth`, `sweep`):
  - the slower memory makes a lane flatten: a run repeating a lane inside a
    fortnight made 0.65x a fresh one (0.93x at 4 days), so the house rotates —
    but on its own it barely moved a quarter (rating 4: 2.85M → 2.50M);
  - the deeper dent is what cuts the quarter (rating 5: 2.16M, 1.51M, 1.30M at
    x2, x3, x4), and it is where information shows: a house that prices its own
    size against the shelf (rating 3 up) buys what the shelf will bear, one that
    reads the top of the book (1 and 2) overbuys. With both, rating 1 loses in
    about two quarters in three (62% and 69% in two samples) and rating 2 in
    9–12%; with the dent alone (4 days) rating 1 lost in only 6%.
- **An idle quarter is a warning, not the sack** (Astra: "warning only"). A
  quarter with no run sold is said and journalled as a WARNING, no commission,
  and the account carries on; only a quarter that lost money on its runs ends
  it. **A second idle quarter in a row closes the account**: the markets cycle
  over weeks, so one dead quarter can be bad luck on a narrow list, two is the
  list or the house, and the account has paid her wages and berths throughout.
  Measured on a one-cheap-good list, 72–78% of quarters are idle at every
  rating: a list that is idle once is idle again.
- **The numbers now** (`tools/measure-firms.cjs quarters 20 2`, each quarter a
  fresh 50,000 cr account, a Talon, a rating-3 pilot, the house's choice of
  goods; 32 quarters per line):

  | | median quarter | p10 / p90 | quarters losing money on real runs |
  |---|---|---|---|
  | hand-flown Talon (baseline) | 19.9M | 15.9M / 25.7M | 0% |
  | rating 1 | −24k | −42k / +20k | 69% |
  | rating 2 | +82k | +11k / +263k | 9% |
  | rating 3 | +1.04M | 0.84M / 1.26M | 0% |
  | rating 4 | +1.24M | 0.98M / 1.49M | 0% |
  | rating 5 | +1.36M | 1.06M / 1.56M | 0% |

  **The baseline** is the same decision rule handed what a captain flying her
  own Talon has (the analyser's prices now, the counter's own price, her own
  footprint on the market's 4 days, the cruise drive's pace — 20x a hired
  pilot's timetable — and an hour or two at each clamp, no wages to a house,
  no commission), **flown end to end for the whole quarter: 623 runs, about 32k
  each.** It is a ceiling, not what a player at the keys makes; a good house's
  quarter is about 0.07x of it, roughly 40 hand-flown runs. Read against a
  part-time player rather than that ceiling, a good house is a few days of
  your own trading a quarter, on a hull you are not flying.
  Cut to one cheap good, every rating idles in 72–78% of quarters and runs
  at about −26k (the running costs); the hand-flown baseline on one good makes
  a median of 4.4k.

**Saves:** survive. One additive field, `firms` (the accounts and the houses'
footprint), absent in an older career; a traded hull's run state rides on its
fleet record (`trade`), which is saved whole already. No version bump.

### Fixed (2026-11-03, station geometry, second pass: the cylinders' arms, flush bores, every lift deck to deck, routes ready before you arrive)

Astra, of the station reports still open: "let's do all the still open stuff".

- **The cylinders' arms are whole again, and the small bays ride them.** The
  converter trimmed each inclined bore where its own centreline first "saw"
  open space, to stop the cradle's hoist hanging out of its block. A
  cylinder's arm bore *is* the arm: it runs from the hub through open space to
  its pod, so it saw space a third of the way along. Arm C (to the arm bay)
  kept 3 faces of about 140 between the hub and its pod. The hub's hole for it
  opened straight onto space, the route-finder's grid flooded the whole hub as
  outside, and no cylinder bay could be routed through it. Every one of them
  was "joined by elevator" in a straight line through the structure: at Halden
  Dock that was the hull out through the hub's underside and across open space
  to the pod. Now every arm bore has walls along its whole run, and every
  cylinder bay's route rides its arm's car down the bore.
- **The bores end flush with what they meet.** Each end of an inclined bore is
  now cut on the plane of the surface its walls cross there (the pod roof, the
  deck, the block wall), not left square or cut by box. Halden Dock's arm A
  stood 0.053 radii (260 m) down through its pod's roof; the cradles' hoists
  stood 0.04 radii (about 190 m) proud of the deck at the top. 27 models
  re-converted (the cradles, cylinders and spines, all liveries).
- **Every lift runs deck to deck.** The skimmer's sort lift stopped 18 m (at
  skimmer-m) under the sort hall's roof, and the spine's hub lift stopped 0.09
  radii under the hub's crown. Both stood a car's thickness proud of the floor
  they start on. Each car's run is now refitted to the decks beside its shaft,
  measured and not assumed. The car sits in its floor, its run ends flush with
  the top of the deck above, both decks are cut round the shaft (they were
  single wall-to-wall plates, which the old cut kept whole), the lower end is
  capped at the car's underside, and a hatch with caution bands closes the
  upper deck's aperture while the car is away. The ring's lift, which the art
  already fits, is unchanged.
- **Transfers go round the other bays' blast doors.** A route through a third
  bay's hall was found straight through its shut inner gate (cradle-s, once
  its hoist bore was whole). The route search now treats every bay's blast
  doors as shut except the two the transfer runs between.
- **No stall the first time you are routed to a berth.** Finding a berth's
  route through a station took 0.1 to 1.1 s in one frame (measured in node;
  up to 4.4 s on a loaded machine; 10.7 s across one system's 58 berths). The
  first arrival at the berth paid it at the docking clamp. Now each system's
  station berths are routed after you arrive in it, 3 ms a frame, the port you
  have targeted first, into the same cache. The same goes for the station's
  collision index and each berth's deck. Measured over cut-sweep's stations:
  2,770 frames, 2,501 of them under 4 ms, 3 over 33 ms (garbage collection on
  a loaded box). Every route found this way is the one the cold search finds
  (58 of 58 compared). After that, the worst first ask for a berth's path is
  2 ms.
- **Each station size carves its own doorways.** The occupancy grid's door
  cuts were made once per model, at the radius of whichever port asked first.
  The cut's lead is capped in kilometres, so it is a different length in radii
  at each size. Each (model, radius) now has its own carved copy, and the
  shared grid is never written.

Measured with interiors.test.js's sweep at Waypoint Dock's radius: berths with
an inner leg through structure, 55 of 131 before, 52 now. No ring, refinery or
small or medium spine has one. What is left is listed in the test: the arm
bores' hub ends (the bore opens into the hub only through structure at the
fleet's width, so the boarding leg still clips the bore's mouth), the
skimmers' hoists, the yards' tracks, two spine-l berths and four cradle
berths.

Not done yet: the yards' tracks and carriages (Halden Yard's "left and right
elevators": flush ends, floor apertures and covers, heights, and the track
hatches still welded into the interior bucket); the yard-navy approaches and
the navy/Syndicate yards' upward-opening bays; the 40 berths standing off a
level floor (Halden Dock b0 and b1 among them); the cradle and yard-syn
arrivals that go indoors and back out; ground ports' own-gear stance.

**Saves:** survive. Only geometry, routes and caches changed. Nothing here is
stored: routes and stand heights are worked out from the model each session.

### Added (2026-11-03, the lead pip and the intercept assist)

Astra: "can we simplify the orbital mechanics controls for the player? Maybe
like when you have selected a target, a navigation pip shows up on the HUD, if
it's in orbit of a star, that pip should track ahead of the target so that your
ship will end up reaching the target when the target will also be intersecting
that point in space?" On the timing she chose drive-aware. On the flying: "I
want the autopilot to do most of the flying with the option to take the
controls myself."

- **The pip.** Lock anything and a pink ring shows where it will be when you
  get there. A dashed line runs to it from the target, along the target's
  motion. Under the ring are the time to intercept and the drive the estimate
  assumes: **cruise** when the drive is yours to use for the trip, otherwise
  **thrusters** and why not cruise (*mass locked by Mirven I*, *too close for
  the drive*). It merges into the target when the two are as good as the same
  point. Off the screen, an arrow on the edge points to it. It shows in the
  cockpit and in the exterior view.
- **How it is solved** (`src/intercept.js`, new). The intercept time T is solved
  so that the time to fly from here to where the target will be at t+T, arriving
  matched, equals T. It uses a fixed point and falls back to bisection. The
  flown-time model is the assist's own flight law:
  - on thrusters, the close-phase law auto-dock already flies, run forward;
  - on cruise, the closing law `steerAutoCruise` already flies, under the drive's
    lock ceiling read along the path, with the turn onto the heading and the
    detour round any world in the way.
  It re-solves four times a second. Between solves the pip holds still in space
  and the count runs down.
- **`I`: the intercept assist.** It is a mode of the existing autopilot
  (`G.autodock.mode = 'intercept'`), not a second one. It turns onto the pip,
  spins the cruise drive up, flies the leg, drops out at the target's velocity
  and makes the final match on thrusters. It parks at a standoff:
  - four capture radii off a station (`T` docks from there in one press);
  - 2 km off a ship;
  - over a ground port at the height its descent starts;
  - in a circular orbit about a world.
- **You can take over at any time.** Any stick or throttle input takes the
  controls, and the assist stands by instead of cancelling. The banner at the
  top says **AUTO** or **YOU**. `I` hands it back, and `Shift+I` stands it down.
  It does not take the ship back when you let go: in space, letting go is a
  choice too.
- **The match marker.** Near the end of any intercept, a yellow diamond shows
  which way to burn to match the target's velocity, with the burn in m/s.
- **Every refusal says why:** no lock, a lock that is not in this system,
  docked, on the ground, inside a station, on the port's rail, out of reaction
  mass. With the cruise drive blocked it still engages, on thrusters, and says
  why the drive is out.

Measured (`test/intercept.test.js`, 24 seeds × an orbital port from another
world, the same port from 3,000 km, a moon and a coasting NPC ship, 96 runs):

- **Arrivals.** Every run that started arrived: inside the standoff tolerance
  and matched to within 2.4 m/s (worlds: into their orbit).
- **Thruster legs.** Arrival is within 0.5% of the pip's prediction, except a
  freighter that started a burn mid-chase (86% late).
- **Cruise legs to ports.** Within 2% typically, and up to 18% late.
- **Moons.** Within ±25%, and one 68% early, where the real detour round the
  planet was shorter than the modelled one.
- **Cost.** A solve takes a median of 0.12 ms and a worst of 2 ms. The pip
  standing on screen costs about 0.3 ms a frame.

Fixed on the way: a traffic ship's `vel` can disagree with its own rail. One
freighter moved at 37.5 km/s and reported 32.4. The assist therefore reads a
ship's velocity off its rail's positions, not the field.

**Saves:** unaffected. Nothing new is saved and the save version is
unchanged. The assist is not carried across a save, as auto-dock is not.

### Changed (2026-11-03, landing on open ground, giant skims retuned, the sky under an overcast)

Astra: "I agree with you on all of that, especially the skimming."

- **Open ground charges what a pad charges.** Setting down away from a port
  was free up to 100 m/s and a wreck past it. It now uses the pad's own damage
  ramp, the same function: free to 20 m/s, costing more hull the harder you
  hit, and fatal at 90. A hard touchdown says what it cost on the touchdown
  line. Gear up on open ground is still a wreck at any speed.
- **The landing autopilot sets her down at about 10 m/s.** It braked to its
  final crawl halfway inside a pad's capture envelope, but a pad catches a
  ship at the envelope's edge, so it caught her still fast. Flown into 47
  surface pads and bays across 12 seeds from 25 km up, it hit every open pad
  at about 138 m/s, which is fatal, and Harrow Deep's shaft at 30 m/s. Nobody
  saw this because pads used to refuse a fast arrival rather than charge for
  it. It now crawls at the edge, at half the lower of the pad's limit and the
  speed damage starts. Measured again: 8.6 to 10.5 m/s, no hull lost on any
  of the 47.
- **Gas giant skims are back where they were.** Once a giant's air turned
  with it, a skim flown with the spin met the air slower. Over 40 giants, a
  prograde pass took 0.53x the heat and 0.81x the hydrogen it used to, and a
  shielded hull could hold three times deeper. A giant's air heat is now x1.9
  and its intake x1.25. A prograde pass is back to 1.01x on both; against the
  spin is about 3.2x the old heat, so it is still the hard way round. Rocky
  worlds and a star's corona are unchanged. Your skimmers' work orders are
  unchanged.
- **An overcast looks overcast from the ground.** At a ground port or a sea
  platform, the sky now shows the weather over that spot. That is the same
  weather the planet is painted with and the port's forecast reports. Overcast
  is a grey cloud ceiling, partial cloud is broken cloud, and the sun and stars
  go behind it. The light goes flat: less direct sun on the ground, the sea and
  the buildings, no glint on the water, and the cloud's own diffuse light in
  the shade. The cloud layer still stays off the ground near your eye, so the
  white streaks it used to leave on the sea round a rig do not come back.

### Saves

Every save loads. Nothing new is written. The landing note on the ship
(`touchdown`) exists only at runtime.

### Fixed (2026-11-03, the Cutter's and the Crawler's models mended; a door out of the Crawler's lift pit)

Astra, on the two model problems the hull-walk fix reported and could not mend
in code: "can you not fix the models?"

- **The models themselves are fixed**, in `ref/glb`, by a new tool,
  `tools/glb-patch.js`, that edits the `.glb` files directly. It only touches
  the parts it names, and only those still open. Running it again changes
  nothing.
- **The Cutter's belly.** Four blisters under her (two on the keel, two sensor
  blisters) were domes with no lid. Their open rims sat a centimetre inside her
  belly, so they could not be seen, but they were holes. Each now has its lid
  (24 faces). Her radar dishes, each two open bowls whose rims missed by a
  centimetre, get their back faces.
- **The Crawler, all three liveries.** Her frame was built of open parts:
  single-sided lamps, hazard stripes, deck markings and her canopy panes;
  downward RCS bells open at the throat, 8 m up her track sides, which you could
  see up into her through; and open-ended struts, pipes and link tubes, plus
  point-defence domes with no base. Sheets get their back face, which looks the
  same because nothing is culled. Shells get lids in their own colour. Bells get
  their throat capped and their mouths left open. That is 65 parts and about
  2,400 faces per livery.
- **A door out of the Crawler's lift pit.** Her lift comes down into a pit
  boxed in by her skirt, with no way through it. Her fore cross-member now has a
  doorway, 2.30 m wide and 2.13 m clear, on the lift's line, framed in her hazard
  amber, with a door leaf in her belly doors' colour slid open beside it. The
  0.6 m "lift lane" you used to duck along is gone; a lift is walked off by the
  same rule as everywhere else.
- **You stand up in her lift pit.** It was 1.80 m to her closed belly doors,
  3 cm short of standing height. The doors (leaf and hazard stripes, both sides)
  are raised one import cell (0.478 m of her art, 0.164 m as flown), as far as
  her hangar floor allows, so the walk from the lift to the door has 1.92 m or
  more over the walker's whole footprint. `render.js` `CR_DOOR`, which finds
  those doors for a founded Crawler station, moved the same cell. It now finds
  only the doors: before, one strip of each skirt rail's inner face also slid
  away with them.
- **The Cutter's sisters too.** `navy-l` and `navy-s` share her lidless
  blisters and open dishes, and `police-s` had an open beacon dome. No player
  walks under them, but they are closed the same way.
- **Caught if it comes back.** `glb2hulls` prints every model's open edges
  and warns, naming the parts, on any model a vertical ray crosses an odd
  number of times. `test/hull-seal.test.js` fails on any model in the
  library above 0.

Before: the Cutter had 38 odd columns and each Crawler livery had 1,592. Now
every hull and livery has 0, in airlock.test, which also walks the Crawler
forward off her lift and through the doorway standing up. All 57 library
models are at 0. The other 50 models in `src/hulls.js` are byte-identical.

**Saves:** survive. Only the art changed; nothing about a hull is stored.

### Fixed (2026-11-03, inside a station on the way through: the rooms are drawn, the routes miss the walls, the lifts carry you, the blast doors are back)

Astra, at Halden Dock, Waypoint Dock, Threshold Dock and Halden Yard:
"station interiors in transitory spaces isn't drawn"; "shaft walls are not
drawn during transit for the angled shafts"; "ship sits on top of the shaft
for the 45 degree elevator instead of at the base of the shaft"; "why is the
shaft protruding from the wall at the top and bottom of the shaft?"; "when
the elevator is not there, there should be a blast door covering the shaft";
"What happened to having those interleaved blast doors inside, separating the
berths from the rest of the station interior?"; "can you ensure that the
surfaces are more than 1px thick?"

- **The station is drawn round you in transit.** The renderer draws one
  compartment when you are in one, and asked "which berth is nearest" to
  decide: riding a bore or crossing a hall beside a bay, you were "in" that
  bay, and with its inner gate shut behind you it was drawn alone - the car
  and two door leaves in black space. A compartment is now only the room you
  are inside (its berth's box); everywhere else the whole station is drawn.
  With the cutaway on and the camera still inside the station's metal, the
  station is lit as rooms, not as a hull in the sun, so its inside walls are
  no longer black on black.
- **Routes through a station go round its walls.** The corners of a small
  hull's route from the heavy bay were found on a coarse grid that let a
  line cross a lift's deck plating, and pulled taut on that grid: at Halden
  Dock one leg ran four kilometres straight through the structure. Each leg
  that crosses a surface (at the fleet's widest hull) is now routed again
  round it. Swept at Waypoint Dock's size: 85 of 131 routed and direct berths
  had an inner leg through something; 55 now, and 51 of those are legs the
  art has no open way through at all (the cylinders' arm bays, the
  skimmers' hoists, the yards' tracks), which are listed in
  interiors.test.js for the art. Every ring, refinery and small or medium
  spine berth is clear.
- **The 45-degree lifts carry you on their deck.** A hull riding an inclined
  car was stood on top of the car's bounding box, which on a tilted car is
  far above its deck: 127 m at Halden Dock, out through the top of the bore.
  It stands on the car's deck now, in the bore.
- **The ring's lift shaft is flush at both ends.** The floor under the
  parked car was solid (car and hull sank through it), and the shaft went on
  350 m below the spoke deck the car stops at. The plating across the run is
  cut, the pit below is cut away and floored at the car's underside, and the
  hatch over the shaft is shut exactly while the car is away and open while
  it is home - the car is the floor when it is there.
- **The inner blast doors are back.** The station set of 2026-09-25 kept
  every inner gate's frame and none of its doors. Every leafless inner-gate
  frame (spine, cylinder, yard, refinery, skimmer, cradle: 39 of them) now
  has a pair of slab doors meeting on interleaved teeth, run by the airlock
  as the inner gate always was, and on the way through a heavy bay to a
  small one the far bay's own inner gate opens for you.
- **The civil yards open their doors.** yard-s, yard-m and yard-l kept their
  door leaves in the wrong part of the model, so they were welded shut and
  every arrival flew through them.
- **Every hull stands on her own gear at a station.** A station berth held
  every hull at one height over the deck, the fleet's: at a small station a
  Talon's gear was 1.2 m into the deck, at a large one she stood 2 m above
  it, and the Tanker stood 5 m into it. Each hull's feet are now on the
  deck, half a metre higher on her gear as before. Ground ports keep the
  old height for now: their walkable hangar is fitted round her as she
  stood, and has to be refitted first.
- **Walls and floors are slabs, not sheets.** 1,670 walls and floors across
  the station models were single flat sheets - a 1 px line edge-on or cut by
  the cutaway. Each is now a slab (a metre at Threshold Dock, four at Halden
  Dock); decals and marks laid on surfaces stay flat. The new blast doors
  are built thick.

Not done, for the art: the cylinders' 45-degree bores still stand proud of
the hull where they meet it (the converter's clipBores trims them by box, not
along the true angled intersection); the yards' track hatches are still in
the hull, closed; the skimmer's sort lift and the spine's hub lift stop
0.04-0.12 radii short of the deck above them (neither is ridden); the yards'
inner gates open onto a wall of the art's own (the hall InnerCurtain).

**Saves:** survive. Nothing is stored that changed: berths, routes, doors
and stand heights are all computed from the model and the hull each frame, so
a ship saved docked loads standing on her own gear.

### Fixed (2026-11-03, her hull is solid when you walk under it; half a metre higher on her gear; a longer ramp)

Astra, on foot in a hangar at the foot of her Talon's ramp: "interior of ship
visible, no collision on underside so we're clipping through the bottom,
please fix"; "the ramp should be longer"; and "the ship should sit about one
half meter higher on the landing gear".

- **Her underside is solid.** The clearance under a parked hull was sampled at
  the middle of each half-metre cell only, so a keel fin narrower than a cell
  (the Talon's, 5 cm off the floor) was invisible from every cell beside it;
  only the walker's centre was asked, not the 0.3 m round it; and a head under
  1.4 m of hull was squashed down to an eye 0.4 m off the floor instead of
  being stopped. Now every triangle of her as drawn (the ramp's well, the
  airlock cut, her legs) is clipped to every cell it crosses, the walker's
  whole disc is asked, and the rule is two heads: under 1.83 m you crouch,
  under 1.34 m she is solid. The eye is held 18 cm under her skin wherever
  you are (the near plane's corners), so it cannot end up inside her while a
  crouch eases down. On a Talon in her hangar, 791 of 14,476 cells are now
  solid. The field is built once per hull and berth: 13-50 ms for the small
  hulls, 240 ms for the Crawler, up to 390 ms for the Carrier.
- **A lift has a way out of its pit.** The Crawler's lift comes down between
  her tracks into a pit closed fore and aft by cross-members 0.66 m off the
  ground, and her model has no door in them. A lift now has a lane straight
  out to open ground where you duck under (13.7 m on the Crawler). This is a
  model issue: a door in her skirt would fix it properly.
- **Half a metre higher on her gear**, at station berths, ground ports, sea
  pads and on open ground. A geared hull stands 0.5 m higher in her own frame
  (the ground beside her, her hangar's floor, her ramp's drop), her legs are
  drawn telescoped to meet the floor, and the sim carries her the same 0.5 m
  higher off whatever deck the berth reports, every frame and along the
  arrival rail. Hulls that sit on their bellies (Mule, Long Haul, Cutter,
  Meridian, Leviathan, Capital, Crawler) are not lifted. Her feet stay on the
  same patch of deck.
- **A longer, gentler ramp.** Cut at 22 degrees instead of 30: the Talon's and
  Kestrel's ramps are 8.7 m at 21 degrees (were 5.5 m at 28.5), the Mule's
  9.3 m at 21 (7.0 at 28.5), the Cutter's 7.3 m at 21 (5.5 at 29), the Long
  Haul's 10 m at 25 (8.5 at 29). A drop too tall for 22 degrees takes the
  whole 10 m up to 33 degrees before it becomes a stair. A ramp stops short
  of a gear leg in its path, which keeps the Bollard's at 8.0 m and 31
  degrees (7.5 m at 29 before) and the Fighter's at 9.75 m and 29. The ramp
  lies in the airlock's floor, so a longer ramp makes a longer airlock, and
  it is never allowed to cost a hull a room the old ramp left her: the
  Enforcer's stops at 6.8 m and 26 degrees (was 5.0 m at 29) so her cargo
  bay stays, 1 m shorter than it was. Stairs (Dart, Samaritan, Trader,
  Runner, Heavy Shuttle, Heavy Enforcer) stay stairs, 0.5-0.75 m longer.

Bays: every geared hull still fits under every bay's ceiling at the new height
except the Carrier, which was already 31 m over every ground-port and sea-pad
ceiling before this change. Pinned in airlock.test (every hull in three hangars,
the flood from hatch to door, the lift agreeing between the sim and the renderer
at a station, a ground port and a sea pad, the ramp's slope, no room lost).

**Saves:** survive. Nothing about the lift is stored: a ship saved docked at the
old height stands at the new one on the first frame after it loads.

### Fixed (2026-11-03, docked at Mirven: the zoom, the floor, the doors and the lamps)

From Astra's playtest of the Mirven start (seed `kawartha`, Threshold Dock).

- **The camera zooms out of a berth on a trackpad.** "Camera doesn't zoom
  out more than 21 m while docked." The hangar let go of the boom only when
  one frame's zoom carried it past 1.08 of its wall, and the wall put it back
  every frame, so a trackpad's small steps were undone one by one (measured:
  stuck at 19 m for ever). The wheel's request is now kept apart from the
  boom, and the walls that are meant to let go judge the request. With the
  cut off, the view hands over to "the station from outside" only once the
  eye is in open space, not in the hull plating.
- **Hulls stand on the bay's floor, not on top of the doorway.** "The ship
  is sitting at the top of the inside of the bay rather than at the base of
  it." Where an anchor box is the throat itself, floor to lintel, the deck
  reading took the lintel's upper face; and the cradle's heavy throat lies
  just above its own floor plate, so the floor was thrown out. Measured over
  every orbital model: 97 of 378 berths off a level floor before, 40 after
  (all of them doors that face down or out of a tilted face, listed by
  berths.test). Every cradle, spine, refinery and skimmer bay that sat on a
  lintel is fixed; Aubade Array, Coldwater Post and Pilgrim Depot are among
  them.
- **The approach follows the landing lights, and waits outside the doors.**
  "Ship is not aligned with the navigation landing lights", and on the way
  out "we phased through the wall just above it". The rail and the lamps now
  share one entry line from the door, and the hull waits half the longest
  hull's length outside the leaves while they open instead of at the door
  plane, where half of it stood through the shut doors. Before: the hull
  went through a shut door at every berth of every model swept (45 of 45 at
  eight models); after: none, outside the civil yards (below).
- **Your own berth's airlock runs while you are docked.** The doors read
  berth 0's airlock for a docked ship wherever she was parked, so her own
  inner gate stayed shut and her own doors started cold on undock.

Still open, found on the way: the civil yards' (yard-s/m/l) door leaves are
in the model's interior bucket, which the door split does not read, so their
doors never open; the cylinders' bore bays have no level floor for the deck
rule to find.

**Saves:** unaffected. No save field changed; a ship saved docked is parked
on the corrected deck when the career loads.

### Added (2026-11-03, the galaxy chart zooms)

Astra: "on the F6 tab I want to be able to zoom in and out on the galaxy now
that we're running so many more stars." The F6 chart was one fixed scale,
about 3.9 px per light year, where the median star sits 11 px from its
nearest neighbour; the middle of the cluster was a smear.

- **Zoom:** the mouse wheel over the plot, anchored on the pointer (the
  galaxy point under it stays under it); `=` / `+` and `-` (numpad too),
  anchored on the selected star while it is on the plot; on-chart `+` and
  `−` buttons, and `WHOLE` to come straight back out. The chart's wheel and
  keys never also zoom the flight camera behind it.
- **Limits:** from the whole galaxy (the old scale) to 40 px per light year,
  set from nearest-neighbour spacing measured over 40 seeds (18,000 stars):
  as drawn, median 2.89 ly, 5th percentile 0.83 ly, so at the closest zoom a
  5th-percentile pair is ~33 px apart and a median pair ~115 px, room for
  both names, while the view is still ~15 ly across.
- **Pan:** drag the plot; `C` centres on your star, `Shift+C` on the
  selection. A press is a click until it moves 4 px, so a drag never
  selects. (`C` still complies with a demand while you are held up.)
- **What shows as you zoom:** names come in by tier (selected, here, course,
  visited, in reach, the rest) and are placed highest first, so they never
  overprint; the reach ring is labelled once it is big enough; a light-year
  scale bar and the zoom factor sit in the plot's corner; the selection and
  your own star get an arrow on the plot's edge, with name and distance,
  when they are off it.
- **Clicks** pick the nearest drawn dot within 12 px at any zoom — the old
  per-star boxes overlapped, and the later star in galaxy order won.
  Clicking your own star no longer silently selects the nearest star.
- **Culled to the view:** stars off the plot are skipped before anything is
  worked out about them; territory is built only for charted stars whose
  flag reaches the view, anchored to the galaxy so a pan blits the cached
  picture instead of rebuilding it. Measured in headless Chrome (software
  GL, a shared box, so read the ratios): the whole galaxy draws all 450 stars
  at a frame median of 10.9 ms against 11.7 ms before the change; ×4.2 draws
  59 and culls 391 (chart 4.7 ms); the closest zoom draws 17 and culls 433
  (chart 2.5 ms). A 200 px drag over 40 frames rebuilt the territory once.
- Zoom and pan last the session (per seed), not the save.
- Key hints on the chart, the H card and FLIGHT-CARD.md say all of it.
  Pinned in galaxyzoom.test (the transform) and render.test (the real
  listeners, culling, labels, territory at zoom, session memory).

**Saves:** survive. Nothing is saved; the zoom is a view, not a fact about
the career.

### Fixed (2026-11-03, outworks tied to the station they belong to)

Astra, of a tank farm hanging off Threshold Dock on two trusses that ended in
empty space: "what is this floating in space unconnected to anything?" The
outbuildings round a dock (tank farms, cargo stacks, solar wings, masts,
scaffolds, greenhouse rings: render.js `stationOutworks`) stood off, and were
tethered back to, the radius of the model's FURTHEST vertex. That is right for a
round hub and wrong by most of the station for a long one: off the flank of a
spine or a yard the hull is a fraction of that radius away, so the outwork stood
well out and its truss stopped short. They now stand off the hull's own reach in
their direction (`hullReach`, the outermost face the ray from the centre
crosses), and the truss ends just inside it; a direction that crosses no face
has nothing to tie to and is skipped. Same draws in the same order, so each port
keeps the kinds of outwork it had; only where they stand changes. Measured over
375 orbital ports in 37 models: 0 tethers now end outside the hull; the old
measure left 871 of 938 short of it. New `test/outworks.test.js` (view group).

**Saves:** survive. Nothing saved; the layout is a pure function of the port.

### Fixed (2026-11-03, the market's keys inside its box)

Astra: "there are options along the bottom ... floating off the box they're
sitting inside of". The market's key line was one fixed line wider than the
720 px panel, so its tail ran out over the border. It now wraps a phrase at a
time inside the panel, growing upward, and lists **Y trade analyser**, which the
old line had no room for. Seen in the same screenshot and fixed with it: the
waste row's note ("pays you to haul it") was measured in the wrong font and
printed over the price beside it; it now steps down to "(paid to haul)", or to
nothing, before it reaches the column. And solid panels are opaque (they were
97.5%, enough for the docking message behind the market to read through as a
ghost between the rows).

**Saves:** survive. Drawing only.

### Changed (2026-11-03, the trade starts carry the trade analyser)

Astra: "for trader start, it gets the analyser, mining start gets the survey
scanner". Both trade starts (Easy's Tallyman, Normal's Talon) now carry the
1,000 cr **Trade analyser** in place of the 7,800 cr market survey array. The
Normal Talon could not fit the analyser at all before (her second utility slot
held the array, her first the scoop), which made the trader's own instrument a
thing the trade start could not buy. Both mining starts already carry the
survey scanner and are unchanged. Every focus at a difficulty is still worth the
same (start.js rule 2): the 6,800 cr difference comes back as cash, so the
trade starts open richer in credits. Pinned in tradeanalyser.test.

**Saves:** survive. A career already started keeps the kit it started with.

### Added (2026-11-03, the trade analyser)

Astra: "add a trade analyzer as a buyable upgrade, 1000 cr, shows the graph of
how every commodity buys and sells at that port, and what the average price is,
your break-even price when factoring fuel in, and the buy and sell prices should
be visually distinct from one another. Trade analyzer text will be in bold, and
I need you to generate a line graph showing the prices of the commodities. This
screen will also be reachable by walking out of your ship and onto a station in
order to read it off a public computer terminal."

- **The Trade analyser**, a new fitting (`portanalyser`): 1,000 cr, a utility
  slot, 0.3 MW and half a tonne, one per ship, sold at every yard (`minDev 0`).
  `Y` opens it, from the cockpit or from the market screen. Docked it reads the
  port you are on; in flight, the port you have locked, anywhere in the system,
  with no range limit (the market survey array already reads every port from
  orbit; a cheaper display of one port's figures failing where that works would
  be a rule with no reason). Without it, `Y` says so and names the terminal.
- **The screen, all in bold.** Every good the port trades — ask, bid and a
  30-day sparkline — and one large line graph of the selected good over **30
  days, a point every 12 hours**, with price ticks in cr and day ticks. **Ask
  solid with round markers, bid dashed with square ones**, in two colours, so
  colour never carries it alone; a legend draws each. A port that only buys a
  good, or a waste producer that only pays you, shows one line and says so.
- **Two averages**, each a labelled reference line: this port's over the
  window and the system's (every port quoting it, over the same window). The
  average is the **mid** (halfway between ask and bid) where the port quotes
  both, and the one line's own price where it quotes one; the screen says which.
- **Break-even = ask + trip fuel ÷ tonnes**, on a **full hold of the good,
  capped by credits and by stock** (the screen says which cap bit). The trip is
  to your lock: a **port** (`T`) costs the cruise drive's reaction mass over
  the straight line between the two ports; a **star** — plotted on the chart
  with `Enter`, or on the analyser's systems list — costs `Galaxy.jumpPlan`'s
  jump fuel for the ship *with the load aboard*. Fuel is priced at this port's
  hydrogen ask (list price if it sells none; milfuel's ask on a military
  drive). It is compared with the locked port's bid now, or the locked star's
  best reported bid, as a margin per tonne. Nothing locked: the ask alone, and
  "lock a target to cost the trip".
- **Other systems** (`Tab`): the selected good's best bid and best ask, with
  their ports, in the 8 nearest systems you can reach on the fuel aboard, then
  systems you have visited, to 12. **Prices as last reported**: news rides the
  freighters, so a report is as old as a class II hull takes to cross
  (`Slipspace.hoursPerLy(400 t)`, 11.8 h per ly — five light years is 2.5 days
  old). Systems come from the same cache a visit uses, so the markets are the
  ones you would find, less the age. Filled one system a frame (5–70 ms each,
  median 19 ms, over twenty seeds), never per frame after.
- **A public trade terminal on every station concourse** (and every sea
  platform's hub): a pedestal with a lit screen and header, placed from its own
  seeded stream on clear floor facing the way you come in. `E` at it opens the
  same screen for that port, no fitting needed — and no break-even: it cannot
  see your ship's lock, and says so. Placed after the dressing, so every
  concourse is dressed exactly as before.
- **`Economy.priceAt(port, cid, t)`**: the market as it was at `t` — the closed
  form, plus your own trades only from when you made them. `price()` cannot be
  asked about the past at a port you are docked at (it answers from the live
  shelf). `price()` and `priceAt()` now share one `quote()`, so they cannot
  price stock two ways.

### Changed (2026-11-03, the trade analyser)

- **The old 7,800 cr "Trade analyser" is now the Market survey array.** Same
  id (`tradescan`), same job (every port's shortages and gluts on the TRADE
  page), same price: the name went to the instrument Astra asked for with it.
  The TRADE page, the start kits' lines and the tests say the new name.

### Saves (2026-11-03, the trade analyser)

**Old saves survive.** No save version change. Nothing new is saved: the
screen is a screen, the plotted star for the analyser lives for the session,
and a ship that already carries `tradescan` keeps it under its new name.

### Changed (2026-11-03, warmer, fuller habitable zones: stars stage 2)

Stage 2 of the star programme. **Every seed's planets move**: Astra accepted the
reshuffle and that careers from before the star programme reset (see **Saves**).

- **A warm anchor.** One world in every system sits at insolation S₀ ~
  log-uniform(0.80, 1.35) Earth units, a = √(L/S₀).
- **A compact chain through the zone** (`warmChainAxes`, fork `'planet-orbits'`):
  1–3 steps inward and outward while the last world is inside the zone, at a
  ratio U(r_min, r_min + 0.18) with r_min = max(1.20, 1 + 8.8·∛(2·m_max/3M★)),
  m_max = 4.2 M⊕ (the top of the solid-world mass draw): 1.306 at 0.2 M☉, 1.225
  at 0.5 M☉, 1.20 for G and up. Past the zone ×U(1.35, 1.80) to the drawn count
  (6–12; the zone is never cut short, and measured counts stayed 6–12).
- **Zone types by warmth**, one pick on the planet's own prng as before: S ≥ 0.65
  terran, terran, ocean, ocean, desert; 0.45–0.65 terran, ocean, tundra, desert;
  under 0.45 tundra, tundra, terran, desert.
- **`opts.legacyOrbits`** rebuilds today's orbits and zone types exactly (a test
  instrument; `test/habitable.test.js` holds 10 systems to names, types and
  semi-major axes captured from 44cd871).

Measured, legacy against new (kawartha's first 40 stars; first 200 in brackets):

| | before | after |
|---|---|---|
| ≥2 warm (S ≥ 0.6) global-habitable worlds | 10.0% (11.0%) | **62.5% (58.0%)** |
| median global-habitable insolation | 0.806 (0.737) | **0.924 (0.899)** |
| ≥2 habitable worlds, any band | 57.5% (58.5%) | 92.5% (92.5%) |
| global-habitable worlds | 45 (251) | 78 (405) |
| terminator / equator worlds | 41 / 5 (188 / 18) | 51 / 7 (254 / 29) |
| mean development | 0.552 (0.563) | 0.619 (0.638) |
| ports per system | 13.52 (13.70) | 15.28 (15.31) |
| closest adjacent solid pair, mutual Hill radii | 12.65 | 9.19 |

Beaverton: 17.5% → 65.0%, median 0.689 → 0.950; driftwood: 15.0% → 67.5%, 0.824
→ 0.996. Across all 1,350 stars of the three galaxies, 2 of 7,189 adjacent
solid pairs fall under 8.5 Hill radii (8.39, 8.42; both heavy pairs at r_min
round an M dwarf). Terminator worlds +24% (+35% over 200), mostly round M
dwarfs; if they read as too many, the lever is `TWILIGHT_INNER` (left at 0.80).

**Gates re-measured (doctrine 6), before → after, and what moved:**
- **Navy cutter** `NAVY_MIN_DEV` 0.55 → **0.63**: at 0.55 it let in 45.8% of
  claimed kawartha systems (was 28.8%); at 0.63, 27.8%. Beaverton + driftwood
  27.6% → 26.9%. Systems with a cutter 21.2% → 19.8%.
- **Naval capital** `CAPITAL_MIN_DEV` 0.60 → **0.68**: 13.7% → 30.7% at 0.60,
  13.2% at 0.68; capitals over 300 seed-i systems 57 (master) → 59.
- **Syndicate flagship** `FLAGSHIP_MIN_CRIME` 58 → **56**: richer systems are less
  violent, and at 58 it let in 55 of 300 seed-i systems (was 64); 56 lets in 62.
  Flagships per naval capital 0.61 (master) → 0.58.
- **Port tugs**: highports doubled (48 → 86 in 25 claimed systems) and tugs went
  3.12 → 5.08 a system, the clutter the tug's first cut was cut back from. A
  world's highports now share one tug (shipyards and carriers keep their own):
  3.32 a system (3.17 over rescue-0..23, was 2.96). Every inhabited system now
  has a tug; the deep, not the system, is where you are on your own.
- **Liners**: unchanged rule (one settled end). Two settled worlds in a system is
  now common (34% → 48.5% of 200 systems); liners +10%, in the same 102 systems.
- **Syndicate tithe**: unaffected — it reads holds, not development (17 holds in
  200 before and after). **The pirate mark** reads standing only.
- **KIND_MEDIAN**: kept (80 + 80 stars): agri 0.89 of it, farm-gold 0.77,
  plant-refinery 1.11, the rest within 4%; distress 7.3% → 7.8% clean, 25.7% →
  28.7% corrupt.
- **Government and crime**: mix much the same (anarchy 4% → 3%, feudal 10% → 8%,
  corporate 12% → 14%); median permissivity 48 → 44, violence 24.2 → 20.1. The
  low-dev/high-dev trend is real and a little gentler: −53 → −46 permissivity per
  unit of development over 600 seeds. economy.test's check compared a mean of ONE
  system under 0.3 (31.0 vs 38.1); it now compares development quarters.

**Fixed, found by the reshuffle:**
- **Ore on dry land** (survey.js): a mostly-ocean world's twelve random tries at a
  dry province could all land in the sea, and the fallback was wet; now it is the
  nearest dry cell. And where every mine stands on ice or a sea platform, the
  first non-mine province is at full strength. (ground.test, 282 of 286.)
- **A surface station's own shuttle** (generate.js `addPortRoutes`): every local
  hop scored the same, so with more than four ports over her world her own
  orbital half was the one cut (stations.test, 0 routes). Her half goes first.
- **Forecast ≠ the station** (economy.js `marketKey`, stations.js `siteKey`): the
  market's demand, wine and shelf hashes read the port id, and the forecast is
  built under a stand-in id; once a site passed dev 0.45 the two disagreed. A
  station of yours hashes on her site.
- **A gold farm is a back room** (generate.js `buildContraband`): a system whose
  only back room was a later gold farm also got a placed fence.
- **Towed in is down** (upkeep.js `towedUntil`, sim.js sea stays): a towed run sat
  on a sea pad the sweep had given to another ship (4 of 15,392 samples), and at
  a ground port lifted back into the holding stack after the tug set her down.

**The three red files, 2026-11-03.** Each was a latent bug in older code that
the reseed exposed, not a stage-2 regression.

- **A ring's heavy bay parked its hull on the roof** (render.js `berthDeck`, sim.js
  `doorFromStand`). The heavy bay opens upward through hatch leaves in the hub's
  roof, and the deck cast read the shut hatch, with vacuum above it, as the floor:
  every ring (all nine ring models, and yard-syn-s's one upward bay) stood its
  heavy hulls on the closed doors, outdoors. berths.test caught it only at a
  1.57 km ring; at a bigger one the hull's centre fell into the carved hatch cell
  and read indoors by voxel accident. A surface on one of the bay's own outer gate
  leaves is no longer a deck where the bay opens upward (and the replacement must
  itself have room for a hull). The arrival and the carve also measured the doors
  from the stand rather than from the berth box's middle, where `berthApertures`
  and the renderer measure them. Zero for every side bay; for the ring's it put
  the doors 0.19 radii above the hatch. Measured over every orbital model at ten
  radii from 1,263 m to 6,714 m (the smallest to the largest of 301 stations in 40
  seeds): rings never indoors 36 → 0 arrivals. Nothing else in the library moved.
- **The street's height over a small moon** (gl.js `overSphere`). The footprint
  mask, the pit wall's building test and their JS twins took the height over the
  sphere as z + d²/2R, which reads low by d⁴/8R³: 11 mm on a 10 m building 3.9 km
  from Harrow Hold's mouth on its 134 km moon, and 0.2 m (FOOT_MIN's own size) at
  the mask's 8 km reach. It is exact now, in a form that stays stable in single
  precision. The cutaway sweep's fixtures were also corrected where they checked
  the wrong thing. The block's expected height is its top's true height over the
  sphere (a block on the mouth's vertical leans 1.7° there). The "hot point" now
  sits a hair past the cut's edge, not up to a sampling step past it: where the
  cone is held to its cap, the line of sight from a point 0.4 m outside the cut
  leaves the cone 17 m back, outside the 20 m test blocks (Downwell, Terminus).
  Before and after shots look identical, as they should for a sub-centimetre fix.
- **A full port told you the wrong wait** (sim.js `berthFreesAt`, combat.js). A
  busy port holds more ships than berths, because traffic is a timetable and does
  not queue. The wait was read off the *next* departure, which takes seven ships in
  five berths to six. The mid-range auto-dock was told 13 min, then 7, 23 and 25.
  It held 68.5 of its 71.9 minutes. The wait now walks the timetable to the
  departure that actually frees a berth (bounded at 24 departures, so a floor),
  and the port says "until a berth frees".
- **Full ports, both of Astra's fixes (2026-11-03, later).** *(a)* **A small
  hull may take a free heavy bay** when every small berth is taken. `berthStatus`
  gives `lend` from the same occupancy count. The clearance says so ("Small
  berths are full. Clearance granted to the heavy bay"; combat.js
  `grantClearance` sets `ship.lentBay`), and `Sim.assignBerth` then gives the
  arrival the largest bay that takes her. The auto-dock asks through the same
  hail. *(b)* **Timetabled traffic books a berth or holds** (sim.js `bookVisit`,
  `earliestFit`, `visitHold`; `trafficCore`, `berthOccupants`). A visit books
  from the earliest moment in its layover from which the berths booked by
  higher-priority visits leave one free until it leaves; otherwise it holds for
  the whole stay, then comes in only to leave on time.
  - **Where she holds.** A ground port's ships hold in the roads. An orbital
    port's ships hold where the crossing ends, alongside, station-keeping and
    in no berth, so there is no jump out to a stack and back.
  - **Priority is fixed, not first-come.** It is a route's place in
    `sys.traffic`: the scheduled lines first, then the feeders built after
    them. That keeps it a pure function of seed and t. A first-come queue
    recurses through the port's whole history, which is integration. At any
    instant a pool holds at most its capacity.
  - **The timetable does not shift.** Departures and every later leg are
    unchanged, and cargo moves as before (the heavies' lighters do the same).
    Delaying departures would make every later leg depend on the queue.
  - **Traffic does not take the heavy bay**, except at a port with no small
    berth. Measured with it allowed, a heavy pilot found the heavy bay full at
    67% of samples instead of 21%: the freighter left circling that the
    smallest-bay rule exists to prevent. One line in `bookAt` switches it.

  Measured, 40 seeds × 20 times (6,240 orbital-port samples; 5,900 surface),
  before → after:

  | | before | after |
  |---|---|---|
  | courier turned away (orbital) | 65.8% | **6.7%** (lent the heavy bay 34.6%) |
  | true wait, courier, median / p90 | ≥156 / ≥249 min | **15.5 / 44.7 min** |
  | courier turned away (surface) | 11.4% | 0.4% (lent 8.2%) |
  | heavy pilot turned away (orbital) | 21.3% | 18.7% (true wait median 8.6 h) |
  | traffic visits held for the whole stay | — | 48.0% (orbital), 38.3% (surface) |
  | delayed, median / p90 | — | 39 / 89 min (orbital) |

  The courier waits are in minutes, as `berths-and-queue` intended. The "third
  turned away" target no longer reads the same way: a small pilot is now lent
  the heavy bay instead of turned away, and almost never waits. The pressure has
  moved onto the feeders, most of which hold in the roads. `trafficAll` costs a
  median 0.48 ms a frame (0.35 before); the first ask in a new system fills the
  cache (28 ms once). The mid-range auto-dock is cleared into the heavy bay and
  docks in **3.4 min** (was 71.9). Its assertion now passes; it was not changed.
  `economy.test` pins it all: no pool over capacity, the heavy bay lent only
  when free, the named wait is the wait there is, a held ship is in no berth,
  and the queue reads the same in any order. Its seam checks now take the hold a
  ship actually flies, and so does rumours.js `berthTime`: a visit with no berth
  is skipped, to the next one that has one.

**Saves:** **do not survive.** `save.js` VERSION 4 → **5**, the one deliberate
break of doctrine 4 for the whole star programme (Astra: "we don't need to have
saves be cross-compatible if we're altering the star generation"). Careers from
before the star programme reset; later star stages ride this same epoch. The
DEPRECATED shelf was empty.

### Changed (2026-11-03, the lessons first, then the ship)

Astra: "make the tutorial go first, then you get to choose your ship".

- **New career asks only the seed.** It starts the classic career — the
  Talon at home, 3,200 cr — with Captain Halloway's lessons. A seed in the
  URL is the same road. The title card no longer has the difficulty and focus
  rows.
- **The picker opens when the lessons end**, by his CLOSE or by END LESSONS:
  the same two questions (difficulty, then focus; Hard skips the focus), as a
  page of the pause menu, with time stopped. Every row says ship, hold, guns
  and **the money it will hand you**: the preset's credits plus the run's
  profit, which the heading also prints once.
- **Hard keeps the Talon** and changes nothing. **Easy and Normal swap the
  ship in place**, at the dock you are on, through the same `Start.outfit` a
  direct start uses, so the kit is identical to a direct start of that choice.
  Credits become the preset's plus the profit. Profit is credits plus cargo at
  this port's price, less the classic 3,200, **floored at nothing** — a run
  that lost money does not come off the start. The hold moves across as far as
  the new hull takes it (contract freight first, then what this port will not
  buy, then the dearest), and the rest is sold here; contract freight that
  will not fit shuts the row and says why. The trade-in is for the Talon only.
- **Not docked when the lessons end?** The choice waits: the card reads *Dock
  anywhere to choose your ship* and the picker opens at the next dock. `Esc`
  closes it without losing it; the pause menu carries a *Choose your ship* row
  for as long as it waits.
- **The Patience is always given**, END LESSONS included, and **after** the
  choice, at the same dock — so the ship traded in is always the Talon, never
  her. His goodbye now comes before the handover, and neither promises the
  Talon stays.

### Saves (2026-11-03)

Old saves survive; no version bump. `startPending` is a new, additive field.
A career saved mid-lesson before this is asked its ship when its lessons end
— unless it chose an Easy or Normal start on the old title card. One saved
sitting on the old HANDOVER step is asked before the Patience comes round
(or, if she already has, the picker's Easy and Normal rows are shut because
you are not in the Talon, and Hard keeps her). A career whose lessons were
finished, or that never had them, is never asked.

### Changed (2026-11-03, more than one star: the plumbing, stage 1)

Stage 1 of the star programme (project doc `claude/stars-and-systems-plan.md`:
close binaries, triples, white dwarfs, a pulsar, a black hole at the cluster
centre). **This is plumbing with no change of behaviour.** Nothing about
generation changes: no new random draws, no binaries yet. Every system the game
makes today has one star at its root and plays exactly as it did; the suite
holds the new code to the old answers bit for bit.

- **`sys.stars`**, set in `finalize` for every system (generated and
  interstellar): the system's real stars. Today `[sys.root]`.
- **`orbit.mu` override.** `Sim.orbitMu` and `finalize`'s period read it when
  present: a star on a barycentric orbit needs G·M_B³/M², which no
  (parent + self) sum gives. `Gen.barycentricMu` is the one formula.
- **A `kind: 'barycentre'` body is supported**: mass the sum of its stars, radius
  0, in `byId` and `sys.barycentres` but kept out of `sys.bodies` — so out of
  gravity, pads, the draw pass, nav and focus cycling, the scopes and the system
  manifest at the source. `planetFamily` stops at one as it does at a star.
- **`Sim.frameBody`**: the body a frame is measured against. `dominantBody` for
  every system today; with a barycentre root, beyond 3 binary separations a star
  hands the frame up to the pair, so circumbinary space does not flip between the
  stars. The trajectory plot, `oscElements`, the ellipse path, apsis times, the
  orbital basis, the HUD speed reference, the attitude ladder (`localVertical`),
  the cruise drop-out's circular orbit and far canisters' rails go through it.
- **`Sim.lightsAt`**: up to three lights from `sys.stars`, flux in insolation
  units, and the flux-weighted direction. Every lighting site that took the sun
  off `sys.root` now asks it: the ground-port sky, planets and rings on the GPU,
  ring chunks and field rocks, traffic hulls, crates, founding crawlers, debris,
  your own ship, the walking and spacewalk views, the boarding tube, stations,
  the shed's lift car, the 2D terminator and the lens flare on the glass (these
  last two take the brightest star). Still single-light in the shaders; several
  lights is stage 4.
- **The corona** (`coronaContext`) loops over the stars, so heat and scooping
  cannot vanish when the root is not one.
- **The SYSTEM page and the legacy HUD** print the star rows through
  `Sim.starLabel` / `Sim.starLuminosity`: unchanged for one star, `G2+K5` and the
  summed light for a pair.
- Left on `sys.root` on purpose, because they want the point the system turns
  about rather than a light: the arrival capture orbit, the interstellar drop's
  rail parent, slipspace wakes, the jump ring and the belt chart's centre.
- New `test/stars.test.js` (core group): 12,148 samples over 20 kawartha systems
  bit-identical, and a hand-built pair held over 10⁴ binary periods.

**Saves:** unaffected. No save field and no version changed; no barycentre is
ever generated, so nothing a save refers to moved.

### Fixed (2026-11-03, the ground turns: landing, standing, lifting and air against the turning world)

Yesterday the HUD learned to read speed against the turning ground
(`Sim.surfaceVelocity`); everything that flies the ship still measured against
the world's CENTRE, which on a spinning world is the velocity of no ground there
is. Measured over 40 kawartha systems, equators turn at: rocky worlds with air
up to 2,040 m/s (median 118), airless up to 798 (median 23), giants' air up to
20 km/s (median 7,030).

- **Touching down on open ground** (Sim `checkImpact`) is judged against the
  ground at the contact point. Before, a hull sitting still on a fast equator
  "arrived" at the ground's spin and crashed (2,040 m/s on Ishtar V), and one
  sliding in at that speed against the ground set down clean. She is left moving
  with the ground, and the impact forecast's contact speed is the same number.
  The open-ground threshold is unchanged: gear down and under 100 m/s, which is
  far gentler than a pad (damage from 20 m/s, fatal at 90). Whether to put open
  ground on the pad's damage ramp is a feel question, left for Astra.
- **Standing on the ground, her nose turns with it.** Her position always rode
  the spin; her heading was a direction fixed in space, so she swung once a day
  round her own gear. The heading is now kept in the world's own turning frame
  (`landedAt.fwdB`, `Sim.bodyFixedDir`).
- **Her stance lasts.** `settleLanded` stood her on her gear for one frame; the
  next re-placed her at the touchdown's 4 m. The spot now takes her stance height
  and heading. A save loaded on the ground is settled on its first frame too.
- **Lifting off** from the no-spot branch (main.js `liftOff`) leaves with the
  ground's velocity plus a metre a second of climb, not the centre's (a 2 km/s
  sideways kick off a fast equator). `Sim.liftOff`, the usual way off, already
  did this; it is now under test.
- **The air turns with its world.** Drag, re-entry heat, the plasma's wind
  direction and the giant skim's intake all read the air's velocity at the
  ship: `Sim.airVelocity`, the centre plus omega x r, with omega from
  `Sim.spinOmega`, the same one the ground and `surfaceVelocity` use. A ship
  hovering still over the ground is no longer charged drag and heat for the
  spin. **This changes how entries and skims play.** Flying the same way the
  air turns, you meet it slower than your orbital speed, and heat goes as the
  cube. Low over the air (0.85 of its top), with the spin:
  - a giant's air meets you at 0.64-0.85 of orbital speed (median 0.77), so
    heat is about 0.46 of what it was and skim intake about 0.77;
  - against the spin it is 1.15-1.36 of orbital speed (median 1.23), about
    1.9 times the heat;
  - on rocky worlds the median is 0.98 (0.93 the heat), as low as 0.68 on a
    small, fast world.
- **The vector assist's HOVER holds against the air at her**, not the world's
  centre. Over a fast equator it used to spend the tank dragging her backwards
  across the ground. In VECTOR mode within 30 km of an airless world it holds
  against the ground (the same `SURFACE_SPEED_KM` the speed readout uses), so
  the number on the HUD is still the number it nulls.
- **Contrails** drift with the air at the point they were laid, and their
  strength reads the same `Sim.airVelocity`.
- **Every surface port's berth now turns her with the world.** Only sea pads
  did (2026-11-02); at a shaft hangar she lay over in her berth as the day went
  on. Now she is re-faced every frame with the `berthFacing` that `dockShip` used.
  The no-bay fallback keeps her nose up as the world turns.
- **Unchanged, on purpose:** the orbit page, the map, the ORBIT readout and
  the osculating elements stay orbital. Autodock and the flight-assist lock
  measure against the target port, whose velocity already carries the spin.
  Station-wall contacts at a surface port use the port's velocity, which is off
  by omega x d for a hull d km from the port's centre (well under 1 m/s).
- **Tests:**
  - new `turningground.test` (group `core`), which fails on the old code:
    - at rest with the ground at the fastest equators in 30 systems (2,040 m/s
      with air, 798 without), she lands, placed or dropped from 20 m;
    - still against the centre there is a crash at the spin;
    - an hour on the ground keeps the same latitude, longitude and heading;
    - an old save's spot keeps its saved nose;
    - lift-off is the ground's velocity plus 4 m/s up;
    - no drag and no heat moving with the air, where the centre's frame gave
      0.077 m/s²;
    - the air's velocity is the ground's;
    - a berthed ship at a shaft port is still level in her berth a quarter-day
      later.
  - Two expectations changed, both because the test built its case in the
    still-air frame:
    - airdata.test: the "coasting through air" case is now 2 km/s through the
      air rather than against the centre. Same expected G.
    - mining.test: "60 degrees off, about half" is now measured from the wind
      the scoop meets (`sk.airDir`), not from +y. The tilted giant's spin moves
      the oncoming air off the orbit line.
- **Saves survive**, version unchanged. One optional field was added,
  `landedAt.fwdB`. A save made on open ground before this has none: she loads
  with the nose she was saved with, and the first frame settles her and records
  it. Nothing else saved has changed.

### Fixed (2026-11-03, sea platforms, third round: windows, lamps, glint, domes, the HUD's speed)

- **The tube's windows are windows.** Astra: "the walking view can show it
  through windows though". The second round painted each pane sea below and
  sky above. Now, on foot at a platform with the GPU, the world is drawn first
  from the walker's eye (main.js `seaWalkWorld`), the same world the chase
  camera sees: the sky over the platform, the swell, the rig, the other domes
  and the ships on their pads. The deck goes over it. The panes are left out of
  the deck's mesh and drawn depth-only before it (walk.js `panesFor`, gl.js
  `GLWorld.queueWindows`), so the wall behind each pane is not drawn and the
  world shows through. It is the cockpit's trick (`queueCockpit`), moved into
  the mesh pass because her hangar and hull share that pass. The depth buffer
  is cleared between the world and the deck, since the rig's own hub, dome and
  tube stand all round the deck.
  - **The plan stands on the rig.** Through a window the world must be seen
    from the right place, so the deck plan is laid where the rig is:
    - she stands at the pad's centre, centred by her own origin (the new
      `origin` in main.js `hangarSpec`), not by her hull box;
    - she faces the door, nose to the hub, as her berth faces her
      (`noseIn`);
    - the tube ends at the drum, 0.98 R from her, where the rig's tube ends.
      A short passage through the drum joins it to the pad room, which is
      still the square inside the dome.
    Measured in the browser at Kestrel Undercroft, pad 4: the plan's tube runs
    from (-118.1, -118.1) to (-33.2, -33.2) m in the port frame, and the rig's
    tube runs from (-118.1, -118.1) to (-32.5, -32.5).
  - **The rig's own tube is cut away round you** while you walk it (main.js
    `seaWalkTubeCut`, the mesh shader's cut box). From inside, its shell and
    floor girder stood between every pane and the sea.
  - **Only your tube is glazed.** The stubs to the other pads are drawn inside
    the hub's block, so glass in them would look out at the inside of a wall.
  - **A ship on a sea pad turns with the world** (Sim `updateDockedShip`). Her
    attitude was set once, at docking, and held still in absolute space while
    her berth went round with the world. Half a day later she was turned on the
    pad, and the deck plan, which is drawn in her frame, turned with her. **Every
    other surface port has the same drift.** It is left alone there, because a
    launch script stands ships up while they are still docked.
  - Without a GPU there is no world to see, so the 2D walk fills the panes with
    one flat glass colour, not a painted horizon.
- **The tube's ceiling light** was the generic room strip: one self-lit plate
  half a metre wide and 120 m long, which from one end of the tube was a hard
  white wedge. Now there is one lamp per pane, on the glazing's rhythm. Each
  lamp is a bright lens in two rings that step down to the ceiling's colour,
  with a lighter pool on the floor under it (walk.js `tubeLights`).
- **The sea's glint** (gl.js `seaShade`) was a wide lobe (power 140) at full
  strength whatever the sun's height, added on top of the water and clipped.
  It is now:
  - a tight lobe (power 900), broken up by the swell into sparkle;
  - Fresnel-weighted, 2% looking straight down and most of the light at
    grazing angles;
  - dimmed and reddened by the sun's path through the air (about
    1/sin(altitude)), and gone below the horizon;
  - screened onto the water rather than added, so it nears white without
    passing it.
- **Most of the "white patch" was cloud.** The cloud deck is painted onto the
  planet's surface, which is right from orbit. Under the world's own sky it was
  painted on the sea round your feet, so on a cloudy hour the swell was a white,
  streaked snowfield from 28 m up and from 300 m. Under the ground sky the deck
  now fades off the ground below 3 km of eye height and is fully back by 10 km,
  where you look down on it. This applies to ground ports too. **The sky pass
  has no clouds in it, so an overcast day now reads clear from under it.**
- **The domes** read nearly white and flat in full sun: a skin of #cfd6db plus
  the sun and the sky fill went past white. The plate is now #8c969e (about 0.58 of white; the sky fill adds about a third again on every side):
  - each row of a leaf is its own sheet, a few per cent lighter or darker by a
    fixed pattern;
  - the seams are darker;
  - odd and even leaves differ by a shade;
  - a sun highlight is added for meshes that ask for one (gl.js `uSheen`,
    `GLWorld.setSheen`; only the petals do, and every other mesh is unchanged).
- **The HUD's speed, near a world, is against its ground or its air.** Coming
  down onto a platform, the band read about 178 m/s (257 m/s at Harrow
  Starport). That was the world's spin, the same cause as the contrail bug.
  The new `Sim.hudSpeed` and `Sim.surfaceVelocity` give the velocity of the
  ground under you, built exactly as `surfaceOffset` turns a port, so a point
  fixed to a port's ground has the port's velocity.
  - **When:** inside the world's air (atmosphere tops over 60 systems are
    72-286 km), or within 30 km of an airless world's ground (`SURFACE_SPEED_KM`;
    airless worlds with ports turn their equators at 0-476 m/s, median 23).
  - **What changed on screen** (two lines of main.js):
    - the STATUS row reads `airspeed` or `gnd speed` instead of `speed`;
    - the speed box on the glass carries `AIR` or `GND` after its unit.
    Out of the air and higher up, both read the orbit, as before. The orbit map
    (F2) always reads the orbit's `speed`. Vertical speed is unchanged, since
    the spin has no vertical part.
  - **Display only.** Here is what each flying system measures against,
    checked, not changed:
    - **autodock** and the **flight-assist lock**: the target port's own
      velocity, which includes the spin, so they are surface-relative at a
      port;
    - the **vector assist's hover**: `atmosphereContext`'s velocity, which is
      the world's CENTRE, not the turning air;
    - **landing damage** (Sim `checkImpact`): the world's
      CENTRE too;
    - **drag**: the centre, by its own comment ("rotation of the atmosphere
      itself is ignored").
    So on a fast-spinning world, a ship that reads 0 `gnd speed` and sets down
    away from a port is judged to have touched down at the spin speed. That
    is a physics question, raised and not touched here.
- **Tests:**
  - seaplatform.test (group `ground`): your tube is glazed and the stubs are
    not; the panes are their own mesh; no face of the deck carries the old
    painted sea or sky; every pane is in the tube's walls, just in front of
    them; main.js draws them with `queueWindows`; she stands at the pad's
    centre 0.98 R from the tube's end, nose to the hub.
  - airdata.test (group `core`): a ship sitting still on 12 surface ports'
    turning worlds reads 0 (the old reading was up to 124 m/s); it says air or
    ground; a 5 m/s descent over a pad reads 5 m/s; in orbit it is the orbit's.
- **Saves survive**, version unchanged. Nothing new is saved.
- **Not done:**
  - Planetary rings, tears and lightning bolts are not seen through the
    tube's panes. They draw after the depth clear and fail against the panes.
  - **The walk's floor is about 2 m under the rig's deck.** It is her gear's
    floor, and she stands a fixed standoff over the deck, not her own gear
    height: at Harrow Starport the courier's gear is 2.3 m under the deck
    plate. So through the panes your eye is just under the neighbouring
    decks' tops, and you see their edges as slabs. This is a berth-height
    question for every pad, not a window one.

### Added (2026-11-02, Captain Halloway's tutorial — from Astra's working copy)

**Saves**

Saves from Brian load unchanged. One field was added (`tutorial`), and a
career saved before it has no tutorial.

**Added**

- **2026-11-02: Captain Halloway's last run, a tutorial that plays like a
  mission.** Astra: "a tutorial which plays like a mission, but teaches the
  player exactly how to maneuver their ship, how to make money ... an old
  ship captain retiring and wanting to show the ropes to a new pilot, and
  when you complete his tutorial, you get his old ship."
  Every new career now opens with Oren Halloway on the channel: forty years
  hauling out of your home system, retiring, and offering you his Tallyman
  Trader, the *Patience*, if you fly one run his way. Fourteen lessons
  (`src/tutorial.js`), each passed by what the ship and the ledger actually
  do, never by a key the tutorial listens for:
  buy a cargo he picks from real prices (F4, Market) · request launch and
  ride the car up (F4, U) · climb on W · lock the station (F3, or `[` `]`) ·
  auto-dock (T, T) · sell it and see the profit · sign a contract (F7) ·
  undock and fly out of the hull · turn the nose (arrows, Q/E) · raise the
  far side of the orbit with a prograde burn (`/`, V, W) · deliver the
  contract · take command of the *Patience* on F5, FLEET.
  The *Patience* is an ordinary fleet record on the clamp beside you, with
  her yard outfit and a month's berth paid. You can keep the Talon or trade
  it in. Running ahead passes lessons early. SKIP STEP passes one, END LESSONS
  (two clicks) ends them with no ship, and HIDE folds the card to a line.
  - **The run is measured.** Across 40 sampled openings, 39 had a good worth
    carrying. The median first hold clears about 4,700 cr against the 3,200
    you start with. The destination is scored down by distance (half per
    ~100 million km), because on profit alone 70% of first runs left the
    home world, one of them 82 AU out.
  - **The card is in the corner when flying and a strip on the screens.**
    At 800 × 600 the full card covered COMMS's launch row and the market's
    sell column, the two things his first lessons ask you to press, so every
    full-screen mode gets a one-line strip across its title bar (MORE brings
    the card back). In flight it folds to one line while a collision, chase
    or node banner is up.
  - The captain's face is the composite-sketch portrait (`portrait.js`):
    the oldest plain face out of sixty draws, a merchant and not a pirate.
  - Hooks: `Tutorial.note` from the market's `trade()` and from
    `Missions.completeAtDock`, `Tutorial.update` once a frame after
    `Missions.update`, and `G.tutorial` in `save.js`.
    `test/tutorial.test.js` (100 checks) walks every lesson and measures
    the run across 40 galaxies.

**Changed**

- **2026-11-02: auto-dock asks for clearance, and holds for a berth.**
  Astra: "auto-docking should never make you a criminal. Auto-dock now
  includes auto-contact the dock for permission to land once we drop out of
  cruise." The autopilot sends the same hail F4 does when it drops out of
  cruise, or at once if the approach is too short to cruise. If clearance
  is granted it goes in. If the port is full it holds off the port (the
  autopilot reads HOLD) and asks again when the timetable says a berth
  frees, with the clock wound up while it waits. If you are barred it stands
  down and the port says why. The capture is also guarded, so no autopilot
  docking ever closes the clamps uncleared. Flying in by hand without asking
  is still your choice and still an offence. `render.test.js` flies it at a
  port forced full.

**Found by playing the tutorial**

- **Auto-dock into a full port made you a fugitive.** Both test ports were
  carrying more ships than berths (11 in 6). A port never offers clearance
  while it is full, and the autopilot docked anyway, so a new player's first
  docking booked a queue jump, 500 cr and FUGITIVE. Fixed the same day in
  the autopilot itself (under Changed). Halloway's stopgap, where he set the
  clearance himself, is gone.
- **An orbital undock can leave you inside the hull.** The clamp lets go
  with a 3 m/s push, nose out. Turning and burning in there put the test
  ship through a bulkhead and lost her with the contract freight. The undock
  lesson now passes only once `Sim.insideStation` says you are out.
- **The flight frame survives a new career.** ORBITAL left on from the burn
  lesson made W prograde at the top of the shaft, and the next career's
  climb flew sideways into the ground at 178 m/s. The climb lesson reads the
  frame and tells you to press `/`.

### Changed (2026-11-02, the drive on the ground: two seconds, longer for bigger hulls)

- **The ground spool is 2 s for a courier and grows with the size of the
  drive** (Astra: "bring the whole engine spool up sequence to 2 seconds,
  longer for larger ships"). It was a flat 3 s. Now 2 s for a 42 t
  courier, growing with the cube root of dry mass (a bigger turbopump and
  chamber take longer to bring up), capped at 8 s: a 260 t freighter is
  about 3.7 s, a capital hull 8 s. Dry mass, not laden: cargo does not make
  the engine bigger. The start message says this hull's own time.
- render.test: "the drive on the ground" now checks a courier spools in
  about 2 s and lifts just after, and a heavy hull is still spooling when a
  courier would be up and is hot in its own (capped) time.

### Added (2026-11-02, sea platforms: a port on the open water)

- **Astra: "for ocean worlds, we want like a floating oil rig style of port,
  and it would be pads that have protected domes open and close to protect
  ships and their cargo from the waves, and a central bar, connected by
  covered tubes."** And: "a dry salt flat has a buried port, water has a
  floating, pontoon-stabilized port."
- **Which ports.** Every pad the inland pass could not put on dry ground, on
  WATER, is now a sea platform where it was rolled (`Gen.makeSeaPlatforms`,
  straight after `placeInland`, no draws). Over the kawartha galaxy that is all
  117 of the `coastal` flags: 102 on ocean-type worlds, 15 on terran twilight
  worlds (14 ring, 1 band). None is left flagged coastal. Never on lava, never
  on a desert (its "sea" is a dry salt basin: ground, buried ports as before).
  - By market role: 38 orbital, 34 highport, 27 shipyard, 18 agri. The
    "orbital" and "highport" here are MARKET roles (`Economy.PORT_ROLES`),
    not kinds of station: "orbital" is the default role any port gets when it
    has no special one (named "Orbital port", which is misleading on a surface
    port, and missions.js already declines to say it), and "highport" is a hub
    on a developed habitable world. Every one of the 117 is a surface pad
    rolled by `makeSurfacePort`; none is an orbital station that strayed onto
    the ground. So all of them make sense as platforms.
  - 24 of them had been rolled as buried bays. A platform is never
    underground; the roll is kept as `seaRolledUnderground`.
- **Identity kept.** id, name, radius, faction, market, missions, the timetable,
  a save's references: unchanged. The farm rules and the town's draws read the
  rolled flag, so nothing else in ANY system moves (seaplatform.test generates
  all 450 systems with and without the pass and compares every port, route,
  patrol and body). New fields: `seaPlatform`, `platformWhy`,
  `seaRolledUnderground`; `typeName` 'Sea Platform'; `coastal` cleared.
- **The rig** (render.js `seaPlatformMesh`, in kilometres, `Gen.seaLayout`):
  - a hub on four columns and a ring of pontoons, with the bar's two-storey
    block, a lit name band, a derrick and a crane;
  - **eight pads**, each its own small semi-submersible on four columns and two
    pontoons, a drum wall round the landing circle (lamps, amber on the large
    pads), and a **covered tube** 120 m to the hub on two trestles, with window
    strips;
  - **pontoon-stabilised and still.** The pontoons are drawn awash at the
    water line (their tops 0.8 m up, so the swell washes over them); the
    columns stand on them; the deck is 28 m up. A semi-submersible's buoyancy
    sits low and its columns are thin at the water line, so it does not bob,
    and the rig is bolted to the world like any ground port. Only the water
    and the domes move.
  - **Why eight pads, two large (north and south):** measured over 120 systems
    and three days, a platform had a median of five ships moored at once and
    eight or fewer 92% of the time. Domes are 100 m across (a waste hauler,
    the largest hull not routed to a large bay) and 170 m on the large pads
    (a tanker).
- **The domes are petals, not a clamshell.** Eight leaves per dome, hinged on
  the drum, swinging up and out past vertical to open. Petals because they read
  as open from every side (a clamshell edge-on looks shut), each leaf sweeps
  only an eighth of the arc and never over the landing circle or the tube's
  doorway, and shut they read as a shell against the weather. Measured: an open
  leaf comes no nearer than 14 m to a neighbour's shut dome.
- **The dome sequence** (Sim `SEA_LEGS`, `seaDomeTargets`):
  - **You, arriving:** cleared and inside the 2.5 km envelope, your pad's dome
    opens; the pad catches you and the rail runs approach (held 90 m over the
    crown) > descend (through the open crown) > settle (onto the stand) > seal
    (the dome closes, over the whole leg) > berth. The dome is open every
    moment the hull is off the deck and starts to shut only once it stands on it.
  - **You, leaving:** undocking always runs that rail backwards: sat on the
    stand while the dome opens, lifted out through it, handed over held above
    it (the ground ports' pad hold). There is no instant way out through a shut
    dome.
  - **Any hull inside a dome's volume and not berthed holds that dome open**,
    cleared or not: the guard that means a dome never shuts on a ship in the air.
  - **Traffic:** open from 60 s or 3 km before she is down until 20 s after;
    shut while she is berthed; open 30 s before she lifts until she is 1.5 km
    off. Measured over three days at 24 platforms: 0 samples of a dome shut on a
    ship in the air over her pad, 0 opened for a berthed ship's own sake.
  - Petals are eased on the wall clock (4 s), like the shed's doors.
- **Traffic stands on the pads** (`Sim.seaTrafficPad`), under the domes, one ship
  to a pad. Closed form off the timetable, swept forward in eight-day blocks
  with a day's pre-roll, so it is the same answer after a warp or a reload.
  Your own pad is left for last. When every pad a ship could use is taken
  (7% of moored ship-samples over three days at 24 platforms; small hulls take a free large pad before
  that) she holds off the rig on station-keeping, low over the water, in plain
  sight, rather than share a dome.
- **Walking** (walk.js `seaLayout`): down her ramp onto the pad under the dome,
  through the dome's door, along the 120 m covered tube, into the hub: concourse
  (market desk, shipyard counter where there is a yard, freight office), the
  bar, the crew hall. The tube is the only way between them. The other pads'
  tubes leave the hub as stubs with the hatch at the end, where a ship moored on
  that pad is boarded. (The deck plan is axis-aligned boxes, so those stubs
  stand for tubes the rig runs out at 45 degrees; your own tube and dome are
  the real length and size.)
- **The cutaway at a platform** is the orbital cone, cut through the dome over
  you, not a street section: there is no ground over you to open, only petals.
  No hole is cut in the planet; nothing of the rig is below the sea.
- **Waves** (gl.js `SEA_GLSL`, `GLWorld.setSeaPort`): a swell of four trains
  (64, 41, 23, 13 m) in a 2.5 km disc round the platform, a closed function of
  sim time: tilted sun shading with a glint; the depth the sea writes lifted by
  the wave height, so the water line climbs and drops on every column (ocean
  worlds; on a terran shore the land is not lifted); foam round each of the 52
  columns and trestles, thicker as a crest passes; whitecaps on the highest
  crests. Each train fades out by its own wavelength with distance.
  - **CPU:** `seaPortNear` (nearest platform within 30 km) and a handful of
    uniforms per frame; `seaDomeTargets` 0.09 ms a frame at the busiest
    platform measured (46 routes); a cold pad sweep 8 to 63 ms, once on arrival
    in a system.
  - **GPU:** four sines per sea fragment inside the disc, plus the 52-post
    foam loop for fragments within the rig's reach (330 m). Not measured on the
    RX 540 (the cloud container has no GPU); see the report.
- **Also:** missions name "the sea platform at ..."; the HUD says "Sea platform"
  and "at sea on"; the control cabinet stands on the hub's deck; the shaft
  doors, collar lamps, the town and its boards are not drawn at a platform.
- **Tests:** `test/seaplatform.test.js` (group `ground`): which ports, identity,
  nothing else changes, determinism, the bay table, the mesh, the petals, the
  arrival and departure dome sequences, the targets, traffic on pads, the walk
  from the ramp to the bar and back, saves. ground.test reads platforms as the
  coastal flags they replaced.
- **Saves survive**, version unchanged. A save docked at one of these ports
  loads onto a pad of it (restore docks by id).
- **Second round, after the first frames:**
  - **The sky.** A daylit platform had a black, starry sky and the planet's
    bare limb for a horizon: the ground sky (sky pass, horizon, haze by optical
    depth) was only engaged by a ground port's street cut. It now runs whenever
    a sea platform is within 30 km of the eye (main.js `seaSkyPort`), cut or not.
  - **Sky fill.** Meshes under a daylit ground sky take a share of the sky's
    light on their shade side (gl.js `uSkyFill`), so backlit domes are not
    black. Ground ports in their cut get the same fill.
  - **The tube** is dressed as a tube in the walk view: chamfered upper and
    lower edges (an octagonal section) and a glazed strip down both flanks,
    pane by pane, painted sea and sky. The deck view draws no world through a
    wall, so the view through the glass is a painting, not the sea.
  - **The black box and slab in the cutaway** were the walking deck's hangar
    and its tube and hub, drawn into the world round the berthed ship in its
    hangar frame. At a platform the berth is the domed pad, so that plan is not
    drawn from outside (it is still what you walk on).
  - **The white beam from a ship into the sky** was her own contrail. Air speed
    was measured against the world's centre, so a hull carried round with the
    ground at the world's spin laid one sitting still, and the points streamed
    off at the centre's velocity. Contrails now measure against air turning
    with its world. This was not new to platforms; it showed there first.
  - **Foam** spreads round each column as a torn ring rather than a square.

### Fixed (2026-11-03, the burnt edge under a building, cleaned up)

- **The stray light pixels in the scorched strip are gone.** At Ashford
  Undercroft from 1.4 km, about six pixels of plain street showed along
  the strip's inner seam, and fainter ones showed in the hot band in open
  street.
  - They were not the footprint mask. The planet pass and the pit-wall pass
    each decide whether a street point is inside the cone, and in the last
    centimetre they can disagree. Where the planet kept a pixel that the
    wall pass sent down the pit wall, the lip's top lay a hair beyond the
    street and lost the depth test.
  - The lip's band is now written just nearer than the street on its ray,
    the same way the street's own band is.
- **The hair-thin light diagonal at the building's corner is gone.** The
  sliced wall is now found where the line of sight leaves the cone. It is
  scorched where that point is inside a building's footprint and below the
  building's height there.
  - The old test asked at the street point, then backed up to the roof.
    That works in the middle of a building but not at its side wall.
  - The street under a building is no longer thrown away. The old discard
    reached half a mask texel past the wall's foot into open street, and
    that strip was the light line. Where the band really is under a
    building, the building's own wall hides it by depth.
  - The scorched face now meets the side wall's own cut band exactly.
- **The corner step is left as it is.** Where open street meets a
  building, the hot line climbs the building's side wall from the street's
  edge to the roof's edge. That is the real cut through a wall the cone
  slices, drawn by the building's own band. Blending the two over a few
  metres would put a hot edge on surfaces that are not cut.
- **The footprint mask:**
  - A one-texel crack between two meshes now reads as the building. Two
    such cracks were found at Ashford from 1.4 km.
  - Heights are stored as a square root, so the steps are fine where
    things are low: 10 cm at a 0.3 m pad, 0.7 m at a 20 m roof.
  - Heights are rounded up, so a roof never reads low.
- **What counts as standing on the street is now 0.25 m, not 1 m.**
  Measured over 20 ground ports of kawartha, beaverton and driftwood,
  low surfaces near the cut's edge run without a gap:
  - kerbs and slabs at 0.05 to 0.15 m;
  - pad trims at 0.1 to 0.35 m;
  - landing pads at 0.6 to 0.9 m;
  - plazas at 0.7 to 1.6 m and at 1.6 to 3 m;
  - the lowest roofs near an edge at 4.0 to 4.6 m.

  No height separates an apron from a building. One metre fell inside two
  plazas, so one apron's cut had one edge on one side and two on the
  other. Counted, an apron has one edge, its own. 0.25 m is where the two
  lines would be under a pixel apart at 1.4 km, and above the 0.18 m that
  a flat slab rises over the curved street by curvature alone.
- The test now stands a block across the line of sight at a building's
  edge, one each way, and checks it is the sliced wall over the exit point
  and the band over the street point. It also walks street points past a
  block's corner and checks each is the sliced wall exactly where its own
  line of sight leaves the cone inside the block.
- Saves are unaffected.

### Fixed (2026-11-02, one burnt edge where a building stands on the cut)

- **Where a station building stands on the cut's edge, there is one burnt
  edge, not two.** From the hole outward you used to see the street's hot
  band, a thin dark strip (the street's scorched half, seen through the
  cut-away building), then the building's own hot and scorched band: the
  "double orange line" Astra rejected on 2026-10-26. Her call: the
  building's edge wins.
  - The street's band, and the lip's hot top, are now left out wherever
    one of the port's cut meshes (the model, its city, its dressing) stands
    over the street. Open street and the lip away from buildings are
    unchanged.
  - How: those meshes are drawn once more, straight down, into a 1024²
    footprint mask in the ground frame; only surfaces at least a metre over
    the world's sphere mark it, so the shaft and the hangar mark nothing.
    The mask is laid round where the cone crosses the street (about a metre
    a texel at Ashford from 1.4 km) and redrawn only when a mesh moves or
    the crossing moves by a quarter of the mask. The CPU cost per frame is
    a placement key per mesh.
  - **The strip under a building is the building's sliced wall.** In the
    first cut of this, plain street showed through the cut-away building
    between the hole and the building's band, and it read as a ledge. That
    strip is the building's wall where the cone slices it, seen from above,
    running from its roof down to the street. It is now painted look B's
    scorched plate and does not glow. The hot third stays where the
    building already has it, on the roof's cut, so a building reads as one
    wider burnt edge. The mask keeps each texel's tallest surface (MAX
    blending, 2 m steps up to 500 m). A street point counts as cut face
    where the line of sight, followed back up to the roof's height, was
    inside the cone.
  - **The lip under a building is scorched for the band's width, then
    rock.** Left as rock right up to the street, the wall's top beds showed
    instead: a pale bed 0.25 m deep, a pixel or less from 1.4 km. That bed
    was the broken light line along the strip's inner seam. It is gone at
    1.4 km and 2 km.
  - The scorched colour is one constant now (`CUT_SCORCHED`), written into
    the mesh shader and the wall shader alike.
  - The test stands a 20 m block on the street's hot band:
    - 100 m tall, the street there is the scorched cut face;
    - 10 m tall, it is cut face exactly where the cone takes the block's
      roof along the line of sight;
    - across the hole, in open street, the band is still there;
    - the same block sunk under the street changes nothing.
    It also checks that the cut face is the scorched colour, not hot and
    not glowing, that the lip under a building is scorched then rock, and
    that the mask's square covers the edge.
  - Saves are unaffected.

### Fixed (2026-11-02, the ground port's burnt edge, the horizon seam, the haze)

- **The cut through the street now has the glowing edge.** Astra: "why is
  the ground port cutaway not have the glowing edge effect?"
  - The port's meshes had the look-B band where the cone cuts them, but
    the planet's surface was only discarded inside the cone, and the pit
    wall had no band, so the edge stopped where a building met the street.
  - The street now gets the same band just outside the cone: the hot inner
    35%, which feeds the glow, then scorched plate. It uses the same width
    rule (6% of the cone's radius there) and the same colour. The pit wall
    gets the same band for that width in metres down from the street; below
    that it is rock strata again.
  - It is drawn in the pit-wall pass, not the planet pass, because the
    planet pass never writes the glow mask.
  - The test walks across the edge on the world's sphere round the hole at
    42 views and compares the street's band with the band the meshes get
    from the cut main.js hands them. They agree at every point.
- **The horizon seam is gone.** At Downwell the hazed ground was pale
  orange and the sky just above it grey-mauve, with a thin bright line
  between them.
  - The haze now runs all the way to the sky's own horizon colour (one
    function, `groundSkyAt`). Before, it stopped short at 92% of a colour
    86% as bright.
  - The planet's limb halo is no longer drawn under the ground sky. It was
    the bright line.
  - The haze reaches 1 at the **true** horizon, which from height is below
    the horizontal.
  - Largest row-to-row luminance step across the horizon, Downwell low
    angle: 69.6 → 3.9 at 0.6 km, 68.8 → 3.6 at 2 km.
- **Less haze from above.** At 8 km the Downwell frame was washed pink.
  - Haze now grows with the optical depth of the path through air that
    thins with height (6 km scale height), not with straight distance. A
    steep look down crosses mostly thin air; a grazing one crosses thick
    air all the way.
  - The rim haze, which treated every ray from near the surface as a limb
    ray, is off under the world's own sky.
  - Ground detail (std-dev of luminance after a 12 px blur is subtracted,
    side panels): 8 km straight down went from 1.73 to 2.07, against 2.17
    at 2 km. At 40 degrees: 2.50 → 3.10 at 8 km, 2.91 → 3.44 at 2 km.
    Plain std-dev at 8 km straight down went from 5.00 to 5.98; mean
    luminance went from 139.6 to 129.9.
- Saves are unaffected.

### Fixed (2026-11-02, ground ports inland: no shaft under the sea)

- **Astra: "placement needs to not ignore coastlines. All planetside ports
  should be set up far enough inland that no underground geometry
  protrudes into the water."**
  - Pads were rolled anywhere on their world and the sea was never asked.
  - Over the 450 kawartha systems, 302 of the 465 pads on worlds with a sea
    or a lava sea had their shaft and hangar at least partly in it. Kestrel
    Pads and Terminus Groundport were two of them.
- **The test for a site** (`Weather.dryAt`, `Gen.footprintDry`):
  - The footprint is a circle of 1.45 pad radii. That is everything a
    ground port can put underground, measured from the art: the widest
    ground site model is runway-city-site-s at 1.41 pad radii, the deep
    bay's tunnel is 1.35, the shed's corner is 0.75, and the walk deck is
    81 m.
  - The worst model is used rather than each port's own, so the answer is
    the same with or without a renderer loaded.
  - Every sample must stand at least 0.046 above sea level. That is the
    shader's soft coastline edge (0.035), plus the most gl.js's ground
    crinkle can ever move a coast (GD.elev / 2 = 0.010, a bound and not a
    sample), plus 0.001 of slack.
  - 25 samples: the centre, 8 at half the radius and 16 on the rim, all
    under 0.2 km apart. A 400-point disc agrees on every pad.
  - **Water is water**: a sea under an ice cap counts.
  - **Lava** is no-go too.
  - A **desert's** sea is a dry salt basin, so it counts as ground.
- **Moving a wet pad** (`Gen.placeInland`, right after the twilight fold
  and before anything reads a pad's position):
  - The pad goes to the nearest site that is dry, inside its twilight band
    if it has one, and clear of the world's other pads.
  - It is found by branch-and-bound over the cube-sphere. "Nearest" holds
    to within 0.25 km and 2% of the distance.
  - No draws are taken. A dry pad is untouched bit for bit, and nothing
    else in any system changes (ground.test generates with and without the
    pass and compares).
  - The rolled spot is kept as `port.movedInland {lat, lon, km}`.
  - 185 of 1,489 surface ports move. The median move is 1,436 km; 10% move
    less than 282 km and 10% more than 3,740 km (19 km to 7,385 km). That
    is 124 terran, 43 molten and 18 tundra.
  - The distances are long because the elevation field is smooth: about
    1.5e-4 per km. So 0.046 of elevation is roughly 300 km of ground, and
    the nearest ground that high is often across a sea.
- **Nowhere dry: 117 surface ports (7.9%) on 80 worlds, flagged
  `port.coastal = true` with `coastalWhy` and left where they were.**
  Astra decides what they get.
  - 102 are on ocean-type worlds, and every ocean-type world has no land
    at all. Sea level 0.78 is above the field's maximum, about 0.66.
  - 15 are on terran twilight worlds whose ring or band never clears the
    floor (best 0.03 above sea), though land does exist outside the band.
  - No system loses all of its pads to the flag.
  - By role: 38 orbital, 34 highport, 27 shipyard, 18 agri.
- **Everything that hangs off a port follows it**, because all of it is
  computed from `lat/lon` at run time: shaft, berth, approach, town, signs,
  traffic timetable, and the survey's mining province. ground.test checks
  the mouth, the berth, a moored trader and a moved mine's rich ground.
- **Cost:** generating all 450 systems went from 0.9 s to about 2 s. The
  worst single system is about 50 ms.
- **Tests:**
  - ground.test adds the inland section: dry footprints, flags with
    reasons, art inside the footprint, the dig margin covering
    `GD.elev / 2`, padDir agreeing with Sim, untouched pads, determinism
    and dependants.
  - galaxy.test's storm-salt collision check now keys on the whole salt.
    Weather is always loaded there now, and its salt32 has only 1,000,003
    levels, so one component of 4,000 draws repeats about 8 times by
    chance.
- Saves: survive, version unchanged. A pad's position is generated, not
  saved. A save docked at a moved port re-docks at its new site (docked is
  an id). A ship saved landed in the open keeps its own body-relative spot.
  A career that remembers where a port was will find it somewhere else.

### Fixed (2026-11-02, ground detail: the oblique streaks)

- **Cause of the diagonal smears in the upper half of Downwell's 0.6 and
  2 km frames: the sun-lit relief, not the octave fade.**
  - I measured it by switching each term off in turn. With relief off the
    streaks were gone; with brightness off they stayed.
  - Relief lit by one sun is the field's derivative along the sun's
    azimuth. The derivative of isotropic noise along one axis is a pattern
    drawn out across that axis, i.e. embossing, and the oblique view lays
    it over into diagonal streaks.
- **What changed:**
  - The slope's spectrum now falls off fast (0.78 an octave, was 0.92).
  - Each slope octave fades out at 2.5 times the footprint a brightness
    octave does, since a derivative aliases sooner.
  - The isotropic brightness mottle carries more of the detail (gain 0.9,
    swing 0.25).
  - Contrast is unchanged: standard deviation of luminance at
    0.6 / 2 / 8 km went from 14.3 / 14.1 / 11.8 to 14.6 / 14.3 / 12.4.
- **The fade's footprint is now exact and anisotropic**, as Astra's
  coordinator asked, though it was not the cause.
  - It comes from ray differentials: how far the hit on the tangent plane
    moves for one pixel across and one pixel down. The larger of the two
    decides.
  - The old estimate was t / (flen cos) with the cosine floored at 0.12, so
    it stopped growing within 7 degrees of the horizon. At the 40 degree
    shots the two agree to within a few percent.
  - The shader computes it analytically, not with dFdx/dFdy, because
    main() has already returned for some pixels of a quad by then.
  - `GLWorld.groundFootprint` is the JS twin, and groundport-look.test
    checks it straight down (t / flen) and at 3 degrees (t / (flen sin el),
    2.3 times the old floored value).

### Fixed (2026-11-02, ground ports: what the slabs were, and ground to stand them on)

- **The pink slabs over Downwell's town were the hatch lamps.** The ring
  of lamps that says whether the port has cleared you (red, or flashing
  green and white) was still laid out in pad radii for a shaft mouth of
  0.55, from before the mouth shrank to 0.20. The doors were converted to
  "mouths" at the time; the lamps were not. At Downwell (pad radius 227 m)
  that put twelve red boxes, each 23 m wide and 45 m tall, 160 m out from a
  45 m hatch, which is out over the rooftops. Through the orange haze and
  the glow pass they were the salmon-pink slabs with a pale outline on
  Astra's sheet. They now sit on the hatch's collar, a fifth of a mouth
  outside the opening, and are about 4 x 2.5 x 3 m: runway-light housings
  that read at a distance by their glow. They stand on the collar top on
  a procedural port and on the street (z = 0) on a modelled one.
- **The yellow squares were the pad-rim sodium lamps and the signs.** The
  rim lamps were 9 m glowing cubes. They are now 2.4 m housings, standing
  on the apron or street rather than buried in it. The signs were
  coloured slabs 25 to 60 m across on a 5 m post, with no lettering. Over
  ground with no detail in it, nothing said any of them stood on
  anything.
- **Signs are signs.** Each board now says what the generator always
  said it says, in Dressing.FONT's stroke letters, lit, on a dark backing
  panel. It is mounted on one of the town's own blocks: on its roof on two
  legs, facing the pad, or across the wall that faces the pad if the
  block already has a board. Letters are 1.6 to 4.5 m tall, sized to the
  building. Boards are at most 14 m tall and in practice up to 41 m wide.
  The role board breaks at its dash ("REPROCESSING / WASTE ACCEPTED"), and
  "&" is spelled out because the font has none. Placement reads only the
  dressing the generator already made. Nothing new is drawn from any
  stream, so every seed is unchanged. The first build came out
  mirror-written: the pad frame is left-handed (`Sim.groundBasis`, east x
  north = -up). The suite now checks with the game's own camera that the
  text runs left to right from the pad.
- **The ground has detail from 0.2 to 10 km up** (Astra: from 8 km over
  Downwell "the whole screen is flat orange"). The planet's terrain field
  is looked up at 2.6 cycles per world radius, so its finest octave is a
  couple of hundred km across. From a few km up the whole view lay inside
  one cell of it. The planet impostor now adds a body-fixed fractal field
  from 8 km cells down to 8 m: brightness mottling, a warm/cool hue drift,
  a small nudge to the elevation the coast and caps are cut from, and
  relief, where the field's own gradient is lit by the sun as slope.
  It is GPU only, in its own functions in gl.js (`groundDetail`,
  `groundDetailTint`, the `GD` table), with two call lines in the terrain
  block. The sky, the horizon, the cone and its strata are untouched.
  - **Seeded:** the hash is salted with the world's own `uSeed`. There is
    no Math.random and no stream draw.
  - **No pop from orbit:** every term is zero-mean, so averaged over any
    patch the colour is exactly the orbital colour. In the JS twin, a
    400 km patch averages to within 0.3%. Each octave also fades out as
    its cells drop below a few pixels, and the whole block is off above
    140 km.
  - **Local brightness:** a small patch is a hillside, not an average. The
    2 km round Downwell's pad is sunlit ground and reads about 18%
    brighter than the orbital colour, falling to 6% at 10 km and 0% at
    40 km.
  - **Precision:** the field is evaluated on an integer lattice anchored
    near the eye (`uGdAnchorCell`, exact), with the ray's near root taken
    as cq / (bq + sqrt(disc)) from a double-precision cq. Single precision
    cannot place an 8 m cell on a 5,000 km world otherwise. Re-anchoring
    gives the same ground cell for cell, so it cannot swim.
  - **Projection:** 2D value noise on a cube-map projection of the
    body-fixed frame, blended across the face seams.
- **Cost of the ground detail.** It was not measured on the Crawler; this
  workspace only has SwiftShader. Under SwiftShader, which runs the shader
  on the CPU, the whole frame went from 1.0 to 1.3 s at 8 km and 1.3 to
  2.5 s at 0.2 km. That shows the block's ALU is of the same order as the
  existing terrain, cloud and storm shading. The estimate for the RX 540 is
  about 4 hashes and ~80 flops per octave, ~7 octaves on an average
  ground pixel: ~0.4 GFLOP a frame at 1280 x 720, so roughly 0.5 to 1.5 ms.
  It is unmeasured; `GLWorld.setGroundDetail(false)` turns it off for an
  A/B on the Crawler. The CPU side is two rotations per world per frame,
  and nothing at all above 140 km. The first version used 3D noise with an
  integer-multiply hash and cost about twice as much; GCN runs a 32-bit
  multiply at a quarter rate.
- New test file `test/groundport-look.test.js` (group `view`) covers:
  - **lamps:** every lamp is under 6 m, outside its hatch and within 1.5
    mouths of it, on the right street;
  - **rim lamps:** under 3 m;
  - **boards:** every board is lettered, on a building, over its
    footprint, standing on its roof, sign-sized, and reads forwards;
  - **ground detail:** the field is deterministic per world, differs
    between worlds, has real variance close up and none once a cell is a
    pixel, averages to the orbital colour, is anchor-invariant, and is
    off above 140 km;
  - **wiring:** the shader is wired as the twin says.
- Saves: untouched. No generated data changed, only how it is drawn.
### Changed (2026-11-02, ground ports seen from outside, fourth round)

- **The pit wall is drawn per pixel, with no mesh** (Astra: the orbital
  cutaway is already per pixel, so do the walls the same way).
  - Built in JS, the wall was about 10,000 quads remade as the camera moved.
    In the probe it cost 7–22 ms a frame while orbiting Ashford Undercroft
    (0.2, 0.6 and 2 km, headless Chrome on the cloud box).
  - Now one full-screen pass (`FRAG_WALL`) casts each pixel's view ray
    against the cone (her end, widening toward the eye, held to a cylinder
    at the cap). Where the ray leaves the cone it shades rock and writes the
    hit's depth, so the bay and her composite against it.
  - The same probe now measures 0.01–0.02 ms a frame: uniforms only.
  - Above the street there is no wall, and none in the bay's open air. The
    layers are looked up from the hit's depth below the street, with the
    same tilt, fold and per-layer colour as before.
  - The bowl of rock round the pit is still a small mesh. It is rebuilt
    only when she moves or the boom changes size by a quarter.
  - `GLWorld.wallHit` and `GLWorld.wallFrag` mirror the shader in JS for
    the tests.
- **The rim is smooth.** The sawtooth edge round the hole at Ashford from
  0.2 and 0.6 km came from whole wall cells being dropped where they
  touched the room or the street. Both tests are per pixel now, so the edge
  is the true curve.
- **The cutaway toggle shows the outside** (Astra: "the cutaways should be
  toggle on/off so you can see the exterior of the station if so desired").
  - Off used to stop the camera at the wall. Now Off means nothing is cut.
    The camera goes out past the hangar wall once the eye would be outside:
    off the hull at a dock in orbit, above the street at a ground port.
    You see the station from space, or the port from the air with the
    ground whole, and her hidden inside.
  - Short of that, the walls still stop the camera. Inside the hangar, the
    room is still the view.
  - The Options row now reads "Off — see the outside, nothing cut".
  - New key: `` ` `` (backtick) flips the cutaway in flight. No other
    screen uses that key. It says which way it went and saves to prefs as
    before. The hint line shows its state while docked.
  - Added to FLIGHT-CARD.md and the H help.
- render.test:
  - wall hits from rays fanned round her lie on the capped cone, show only
    below the street and outside the bay's air, and a ray straight at her
    meets no wall;
  - a 0.2 m move does not rebuild the bowl;
  - with the cut off, an orbital berth and a ground berth reach 8 km with
    nothing cut and the eye outside; with it on, the same boom cuts again;
  - `` ` `` flips the cutaway and says so.
- Not saved beyond the existing prefs field; no save change.

### Fixed (2026-11-02, ground ports seen from outside, third round)

- **The sky has its own colour, and there is a horizon.** On Oruun the sky
  took the same orange as the air, the halo and the ground, so from the
  street the deck ended and orange carried on. Now:
  - By day the sky is the air tint carried most of the way to a scattered
    blue-white.
  - It is a gradient: palest at the horizon, darker toward the zenith, with
    a soft glare round the sun. Dusk warms the low sky on the sun's side;
    night and airless worlds are dark, as before.
  - It is drawn as its own full-screen pass behind everything
    (`GLWorld.drawGroundSky`).
  - The ground hazes into the horizon's colour with distance, a shade
    darker than the sky, so the horizon is a line (`groundHaze`).
  - Measured from the street at Downwell at 3 km: sky L* 77 against ground
    L* 58, hue 349 degrees against 14, deltaE 49. With the sun forced lower,
    deltaE is 39 at 9 degrees, 22 at 2 degrees, 14 just after sunset and
    5.5 at full night, where both are near black and only the stars tell
    them apart.
  - The sky and the haze are their own GLSL block and function (`SKY_GLSL`,
    `groundHaze`), mirrored in JS by `GLWorld.skyAt`.
- **The pit wall reads as cut rock, not a vortex.**
  - The 48 flat facets each lit at their own angle were the spokes. The wall
    now shades smoothly through per-vertex normals: `uploadMesh` takes an
    optional `vn`, and an optional `vcol` for per-vertex colour.
  - Down a near-level cone, the beds traced across the generators had
    become long slivers. The wall is now a grid of 104 generators by 64
    rows, each face coloured by the bed it is in. Cells a bed edge crosses
    are split 2x2 and blended per vertex.
  - The beds dip one way per port and fold together about 22 m on a 140 m
    wavelength. Each bed's colour is nudged per bed. All of this comes from
    a hash of the port's id, so the same port shows the same rock every
    visit.
  - The black cap past her is gone. The pit is set in a bowl of rock under
    the street, sunk with the planet's curve. Anything that misses the wall
    and the bay meets rock; up is still open to the sky.
- **No crater from far out.** The cone stops growing at the street: its
  radius is held to the lesser of its width there and the bay's footprint
  (the room's half-diagonal plus a hull). It is a cylinder from there on,
  in the shaders and in the wall alike. At Ashford from 2 km the hole went
  from about 1 km across to the bay's size, about 0.7 km.
- render.test checks:
  - the street hole is no wider than the bay;
  - the cone is held to the bay whenever the eye is above the street;
  - a hull's width round the whole sight-line to her stays cut at every
    angle swept;
  - the sky is paler and bluer than its air, and darker at the zenith than
    at the horizon;
  - every wall face lies on the capped cone, below the street and outside
    the bay's air.
- The wall is rebuilt only when the eye has moved 0.8% of the boom. A
  rebuild measured 6-30 ms in headless Chrome on the two-core cloud box;
  not yet measured on the Crawler.
- Not saved; no save change.

### Changed (2026-11-02, ground detail and biomes, second pass)

- **No more directional grain.** At Downwell from 0.6 to 8 km the ground
  read as brushed metal or diagonal rain. Every octave shared one
  axis-aligned lattice, and each added the same directional bias.
  - Each octave is now turned by its own golden-angle rotation.
  - The anchor stays exact: JS turns it by the same angle in double
    precision and hands the shader an integer cell and a fraction per face
    and octave (`uGdCell`, `uGdFrac`).
  - The JS twin does the same, and the anchor-invariance check still
    passes.
- **No camouflage.**
  - The clamps on brightness and relief are now soft limits,
    x A / (A + |x|). A hard clamp turned every overshoot into a flat
    plateau with a hard edge.
  - The swings are capped, and fine-octave slope is reduced.
  - Bright ground (snow, ice, salt) gets 30% of the detail, and what
    darkening remains turns blue-grey.
- **Measured contrast:** standard deviation of luminance, 0–255, over the
  top 280 rows of the same shots.

  | Shot | Master | First pass | Now |
  |---|---|---|---|
  | Downwell 0.6 km | 12.8 | 17.0 | 14.1 |
  | Downwell 2 km | 10.0 | 14.2 | 13.7 |
  | Downwell 8 km | 10.1 | 16.7 | 13.1 |
  | Downwell Downport ice, 2 km | 2.3 | 27.1 | 4.8 |
  | Downwell Downport ice, 8 km | 17.4 | 26.0 | 17.5 |
  | Low Deep 8 km | 13.5 | 24.9 | 17.1 |
  | Ashford 8 km | 6.3 | 20.5 | 9.4 |
- **Mountains follow ridges.** Rock and snow are cut from height plus a
  ridged noise, so a high massif is ranges and crest snow, not a round
  white hole (Kawartha star 11).
  - Rock is now a darker, greyer version of the ground it stands in. A
    desert's mountains no longer read as grey stains from orbit.
- **Tundra is lichen, not olive.** The polar and cold rows of the colour
  grid are grey-green-brown, and a tundra world runs 0.1 colder.

### Added (2026-11-02, biomes)

- **Earthlike biomes** (Astra: "Can we also have some more earthlike
  biomes on planets?"). The land on terran, ocean and tundra worlds, and
  more lightly on deserts, is split Whittaker-style by temperature and
  moisture.
  - **Temperature** comes from the world's insolation
    (`warm` = 0.62 + 0.30 log2(insolation), measured against the range
    across 40 systems), cooled by latitude off the real spin axis and by
    height on the mountains.
  - **Moisture** comes from distance to the sea plus a low-frequency
    noise field.
  - **Colour:** a 4 x 3 colour grid interpolated bilinearly, with wetland,
    bare rock and snow on smooth ramps over it, so nothing meets at a
    line. Each world's own colour tints it a little, and per-type
    blending means a desert keeps most of its sand and a tundra its cold
    grey.
  - **Twilight worlds** take the biome as their band's living colour.
    Green appears only in the band: the suite checks 2,749 green samples
    in the ring and none outside it, over 26 terminator worlds.
  - **No biomes** on rocky, molten or iceball worlds, or on giants.
- **One copy, two languages.** `Weather.BIOME` holds the table and
  `Weather.biomeAt` the arithmetic. gl.js builds its GLSL (`biomeColour`)
  from that table at load. `terrainAt` now also returns `biome`, a name
  such as taiga, savanna, ice cap or wetland. Nothing in gameplay reads it
  yet.
- **Ground detail and biomes.** Up close, the ground detail multiplies
  the biome colour and nudges the moisture, so biome edges are ragged at
  ground scale (this part is shader-only and zero from orbit).
- **Distribution** (test/biomes.test.js, 261 worlds, four galaxies):
  - **Terran land** (11.9% of the surface; the rest is sea, as before):
    taiga 28%, ice cap 16%, tundra 16%, temperate forest 13%, mountain 9%,
    wetland 9%, grassland 4%, snowfield 3%, rainforest 1.4%,
    savanna 0.9%. It runs boreal because the median terran gets 0.69 of
    Earth's sunlight.
  - **Desert:** desert 84%, ice cap 6%, savanna 5%, mountain 2%.
  - **Tundra:** tundra 45%, ice cap 33%, snowfield 11%, taiga 6%.
- **Nothing the survey reads moved.** Elevation, sea and ice from
  `terrainAt` are bit-identical (checked on 4,000 points). The survey,
  ground, claims, mining, prospectors, farms and weather suites pass
  unchanged.
- Found while measuring: **a desert's "dry basins" never appear.** Their
  level is 0.16 on the elevation field, and the field's 1st percentile is
  0.294. This was already true before this change and was left alone.
- **Cost:** one more 4-octave fbm per planet pixel on biome worlds,
  against the eight the terrain and cloud shading already pay.
- New test file `test/biomes.test.js` (group `ground`).

### Fixed (2026-11-02, ground ports seen from outside, second round)

- **The ground-port view was upside down.** The first round's camera frame
  took `Sim.groundBasis` as it is, and that basis is left-handed (its north
  is east x up), so the picture's up pointed into the ground: sky at the
  bottom of the screen, the near side of the pit at the top. Found from
  Downwell Starport at 8 km as "a V in the sky". The camera's frame is now
  right-handed (north = up x east). render.test now checks that the
  picture's up is the ground's up, and that check fails on the old frame.
- **The cut is a cone, and it cuts only what is in the way** (Astra: "the
  pit walls should appear along the cone drawn from the center of the
  radial camera out to the edge of the screen; and the 'laser cut' effect
  should only be drawn instead of whatever is in between the ship and the
  camera"). The square section is gone. A ground port is cut the way an
  orbital dock is: one cone round the line from the eye to her, a hull
  length of clearing at her end, widening by the same 20 degrees toward
  the eye. The port's meshes go only inside it (the keyhole, hot rim and
  all, with her deck kept on the ground's vertical). So the shaft collar,
  the apron, the town and the rest of the hangar draw whole round the hole.
  The planet's surface goes where the cone crosses it, in the same test.
- **The pit wall is the cone's own surface**, drawn as rock wherever it is
  in the ground. It is clipped at the street and left out where the cone
  runs through the bay's open air. Its strata are horizontal planes, so
  they run level round the pit. It is capped just past her, so a ray down
  the cone meets rock. From the camera the wall runs from her at the
  middle of the screen out past the edges.
- **Daytime sky in the cut** (Astra: "put daytime sky when looking up out
  of the cut"). The game had no sky as seen from the ground: rays that
  missed the planet fell through to near-black space. In the cut, the
  frame now clears to a sky built from the same two numbers the planet's
  halo already uses: the world's air tint and how much air it has. That is
  lit by the sun's height over the port. Day is the tint, a low sun warms
  it toward dusk, and below the horizon it fades to night over a few
  degrees. Airless worlds stay black. There are no stars by day. It is one
  flat colour, with no gradient.
- **The shaft's hole in the planet has round rock walls** down to its
  floor, in the same beds, instead of a flat floor that read as a grey
  disc from the air.
- render.test, "the ground under a ground port", is extended:
  - the picture is the right way up;
  - the cone narrows to her, and its middle is cut, while a point beside
    it and the deck just past her are not (`GLWorld.coneCuts` mirrors the
    shaders, whose text is pinned to the same expression);
  - every pit-wall face is on the cone, below the street and outside the
    bay's air;
  - the sky over the port is the world's air in the sun, and black at
    night or on an airless world;
  - the hole in the street is no wider than the cone there.
- Not saved; no save change.

### Changed (2026-11-02, the test suite in groups)

- **`npm test` runs the suite in ten groups** (Astra: "if the full test
  suite isn't running, we have to break the tests into various suites").
  It was one 79-command `&&` chain: it stopped at the first red file, hid
  everything after it, could not run only the part a change touched, and
  when `berths.test.js` was killed for memory beside two headless browsers
  it said nothing about which file or how big. `tools/run-tests.js` now
  runs `core`, `render`, `view`, `berths`, `ships`, `transfer`, `combat`,
  `economy`, `ground` and `story`, each file in its own process and one at
  a time, reporting every file's time and peak memory; a red file does not
  stop the rest, and the summary names every one. `npm run test:<group>`
  runs one group, `npm run test:list` shows them, `--stop` stops at the
  first failure. Every test file must be in a group — an ungrouped one
  fails the run before anything starts.
- Measured on the first run (79 green, 7 m 19 s): `transfer.test.js` peaks
  at 2.2 GB, `berths.test.js` 2.2 GB, `render.test.js` 1.1 GB; nothing else
  passes 0.75 GB. Those three are groups of one.

### Added (2026-11-02, the drive on the ground)

- **Starting her on open ground.** Astra: "we also need a means of
  starting our engine and launching off the surface when we land away from
  a port, like for setting up a mining drone." The way off was always R
  with enough thrust to beat the world, but nothing said so once the
  touchdown message had faded, and a drive that was always running could
  not be seen to start. Now a touchdown away from a port shuts the drive
  down, and a strip under the heading tape says so for as long as you sit
  there (first placed at the canopy's foot, where the screenshot showed it
  printed over the key hints and the message line): **ON THE GROUND
  · DRIVE COLD · R TO START**. The first R (or W with her nose to the sky)
  starts her: three seconds of real time winding up, a bar filling on the
  band and the drive heard spooling, which runs to the end once begun.
  Then **DRIVE HOT · HOLD R TO LIFT**, and R lifts her exactly as before.
  Held straight through from cold, she lifts the moment she is hot, so
  "hold R" is still the whole instruction. Leaving the seat — walking out
  to plant a drone — shuts her down again; so does loading a save on the
  ground. Refusals say why: no reaction mass ("the drive has nothing to
  light"), and W with her nose level ("W would push her along the ground —
  R lifts her straight up") instead of doing nothing at all.
- **The ramp check now covers open ground too.** It was only asked on the
  no-spot branch; a ship set down on open ground lifted with her ramp
  hanging open.
- The drive's state is transient (cold is the truth of a ship that has
  been sitting on the ground), so nothing is added to the save. No save
  change.
- render.test: "the drive on the ground" — touchdown is cold and says so,
  R starts rather than lifts, the start completes with R let go, hot R
  lifts, and R held from cold is still down at 2.5 s and up by 3.5 s.

### Fixed (2026-11-02, station cutaway)

- **Zooming out of a berth reaches the outside again, with your ship in
  it** (Astra: "the station cutaway thing should allow me to zoom out and
  view the station from the outside, and show my ship. This isn't working
  now ... even for planet side stations"). Since the walking deck's hangar
  became the chase view round a berthed ship (2026-10-31), its walls
  clamped the boom every frame — measured at 21 m at Waypoint Dock and 6 m
  at Ashford Undercroft, whatever the wheel asked — and the station's own
  model was not drawn, so there was no outside to reach. Now the hangar is
  the view until you wheel past its wall (8% over its reach); from there
  the camera belongs to the station as it does in flight: the cutaway
  opens the hull round her at an orbital dock, the street section opens the
  ground over her at a surface or underground port, and further out it is
  the station from space or the port from the air. Her hangar deck is still
  drawn round her, cut the same way, so she stands on a floor rather than
  hanging in the bay's box. Wheel back in under 92% of the reach and the
  hangar is the room again (two thresholds, so a boom resting on the wall
  does not flicker). Not saved; no save change.
- **The street section is only as big as it needs to be.** It grew with
  the camera's distance so the eye was never inside solid ground; zoomed
  out over a port that made a pit kilometres across, with the stars
  showing through the planet. Once the eye is above the street the
  section only has to clear the line of sight, so it takes the sight-line's
  offset where it crosses street level — about 0.6 km over Ashford
  Undercroft's 860 m-deep bay at 8 km out, where it was over 4 km.
- render.test: "zooming out of her hangar" — leaves the hangar, reaches
  8 km, the station is cut round her, the street section stays small, and
  wheeling back in restores the hangar clamp. It fails on the old build.

### Fixed (2026-11-02, ground ports seen from outside)

- **Zoomed out of a ground port, the camera stands on the ground.** Astra's
  sheet from Ashford Undercroft showed the hangar floating in black space
  with stars under it, a dark trench, huge striped walls, a pale-blue slab
  and her ship a speck. One cause under most of it: the camera's yaw and
  pitch were angles against the star system's axes, and a port on a planet
  has its own vertical wherever the planet's spin has carried it. At a
  ground port the boom is now measured in the ground's own frame
  (`Sim.groundBasis`): yaw round the local vertical, pitch above the local
  horizon, and the picture level with the street. Handover into and out of
  that frame converts the angles, so the view does not jump.
- **Once the boom can reach the street, the eye is above it.** Same
  closed-form arc as the deck clamp, round the local vertical, with a
  margin that grows with the boom (5 m at the least, about 4 degrees down
  on a long shot). Shorter than that — Ashford's bay is 860 m down — the
  eye stays in the section, which is built round it and her, so the walls
  between the camera and the ship are always cut away. Between half that
  length and all of it the allowed arc closes onto the vertical, so wheeling
  out cranes the camera up the cut and out through the top of it.
- **The surface is only there when you are above it** (Astra). Under the
  street the port is lit as indoors (the pale slab was the shed's wall lit
  by the sun 860 m underground), the town is not drawn, and what the
  section's walls do not cover is rock, not stars.
- **The shaft's hole in the planet has a floor**, at the bay floor's depth
  in the section's rock colour, so looking down an open pad from the air
  is no longer a black disc with space showing through the ground.
- **The rock beds in the section's walls thicken with depth**, from 5 m to
  at most 60 m, so a deep wall is a few strata rather than a moiré of 170
  stripes. **She is bracketed** when a cutaway is open and her hull is
  under 28 px on screen. The ecliptic grid is not drawn at a ground port.
- render.test: "the ground under a ground port" sweeps a deep bay (Ashford
  Undercroft) and an open pad (Downwell Starport, Oruun) across three
  elevations, two azimuths and booms of 0.05 to 8 km: the frame is the
  ground's, the eye is above the street whenever the boom reaches it, under
  the street the eye and the ship are both inside the section box, and the
  planet is drawn under the site with a floored hole. The draw itself
  (town, indoor light, rock sky) is pinned to the same predicate rather
  than observed, because the stub canvas never reaches a port's model. Not
  saved; no save change.

### Fixed (2026-11-02, deck fixes)

- **The glitchy bar door** (Astra, on Downwell Bunker's concourse: "this is
  the bar; the door is glitchy"). Every pair of rooms that share a wall
  built that wall twice in one plane — the concourse's at x = -13 and the
  bar's — and the GPU culls nothing, so the light concourse wall and the
  dark bar wall fought for every pixel round the doorway and shimmered as
  you moved. It was true of every shared wall on every station deck; the
  bar was where it showed worst. In the deck's GPU mesh (`Walk.meshFor`)
  each room's walls now stand 6 mm into their own room, so from inside a
  room its own wall is always the nearer. walk.test: "no two rooms' walls
  are drawn in the same plane" (it found 50+ fights before).
- **The Crawler's lift is inside her hull** (Astra: "fit the lift in the
  crawler to the hull"). The car sat straight aft of her lift lobby, which
  put the shaft where her lower decks pass a gap in her frame, and on the
  main and junction decks it ran a metre outside her plating — the fit
  test carried an exemption for it. Measured over all three decks at once,
  a centred shaft fits from 10 m aft of the bridge door to 20 m, so her
  lobby is 2.1 m longer (`LOBBY_EXTRA` in shipdeck.js) and the shaft stands
  at 9.4-11.3 m. The exemption is gone: boarding3's "no room stands outside
  her skin, on any hull" now covers the Crawler's lift, and fitting took
  nothing away from any hull.
- **Every cockpit at its canopy glass** (2026-11-02). Astra, of the Talon:
  "the cockpit on the starting ship is recessed into the block that juts
  out with the cockpit glass on it ... it should be cut into the nose
  block"; asked which block, she chose the jutting one, a step up from the
  passage; then "the cockpit fix should apply to all ships IF the glass
  isn't the forward-most part of the cockpit." The cause: `fit-hulls`
  puts the eye at the lowest point her deck fits, for a short ramp, and
  never looks at the glass, so the Talon's pilot sat a metre aft of the
  canopy and level with its bottom edge, down in the wedge under the nose
  block with its sloping skin through the room. Moving the whole deck does
  not fit (her passage comes out of the block's top), so the cockpit alone
  moves: a room may now carry a floor of its own (`y0`), and a hull in
  shipdeck.js `RAISED` has her cockpit `rise` up (or down) and `fwd`
  forward, a stair of a few treads aft of it down to the bridge door on
  the deck (`stairMesh`), and the rest of her deck exactly where it was in
  her hull. `ShipDeck.floorAt` is the floor under you; the walker climbs
  the stair (main.js `stepWalk`), her people stand on it (npc.js), the
  door leaves, bulkhead and rear screens are at the stair's foot, and her
  windows from outside cut the well round the raised room. The Talon's eye
  is now 0.5 m up and 1.2 m forward, behind the glass, its floor on the
  block's underside. `tools/fit-raised.js` measured every hull's canopy
  box against her cockpit and found the raise for each: raised (or
  levelled and moved forward), the Talon, Dart, Kestrel, Wren, Longhaul
  and Syndicate Enforcer; down a stair, the Sump, the Hawser Heavy Tug,
  the Tallyman and the Lance (their glass is below the old eye); moved
  aft, the Bollard (her windscreen stood ahead of her glass). Left alone:
  the Samaritan and Heron (already at their glass); the Coldwater Tanker,
  Naval Cutter, Corsair Runner and Syndicate Heavy (their glass box is
  off-centre or aft, not a canopy); the five decked and towered hulls
  (their cockpit is a deck reached by lift); and the Mule, which
  qualifies but whose bridge deck comes out of her skin at every eye
  tried. New `test/nosecockpit.test.js`: each raised eye within 0.5 m of
  its glass, the cockpit inside her but its windscreen, every other room
  where it was, no jump on the stair, and every other hull unmoved.
  **Saves survive**: nothing saved changes.

### Added

- **2026-11-02 — Choose your start: difficulty, then focus** (`start.js`).
  Astra: "I also want to be able to select the ship I start with based on
  what I'm wanting to focus on - trade, mining, combat." New career now
  asks how hard, then at what (skipped on Hard), then the seed, as rows on
  the title card; every row names the hull and the credits, with the
  hold, the guns and the kit on the line under it. Pointers (▸ ◂ ▲ ▼) are
  the direction cues, not words.
  - **Easy** (107,600 cr of ship and cash, any focus): trade = Tallyman
    Trader, intermittent + pulse, shield, trade analyser, 15,000 cr;
    mining = Sump Waste Hauler, mining laser, survey scanner, shield,
    16,200 cr; combat = Dart Interceptor, beam + pulse, shield, four Hawk
    seekers, 30,720 cr.
  - **Normal** (71,400 cr): trade = Talon Courier, pulse, trade analyser,
    shield, 20,500 cr; mining = Bollard Tug, mining laser, survey scanner,
    shield, 6,000 cr; combat = Lance Fighter, beam + intermittent, four
    Hawks, 11,520 cr. The Lance carries no shield because one will not go
    in: a generator is 4 t of her 6 t fit budget, and with it aboard there
    is room for no gun (the test pins the refusal).
  - **Hard** is the career as it always was — Talon, pulse laser,
    3,200 cr — and is not a preset at all: no plan, the old path, line for
    line (the test compares it field for field with a career started with
    no choice).
  - Value is hull + fittings + seekers at list, plus cash; the dearest
    kit at each difficulty gets the floor (15,000 easy, 6,000 normal) and
    the others the difference, computed rather than written down so a
    repriced laser cannot make one focus richer. Every hull still gets the
    standard scoop and cruise drive.
  - Where: trade docks where a career always has; mining at the nearest
    mining head (all are Guild halls), from the home world — 26 of 30
    measured home systems have one, and the other four start at the
    nearest unrestricted star that does; combat at the nearest shipyard
    (15 of 30 homes), else the best-developed port. No random draws, so
    the same seed starts at the same port. The pad says what the focus
    set you up for, and the full line goes in the captain's log as CAREER.
  - The choice is saved as `start: { difficulty, focus }`, additively; no
    save-version bump, and an older save loads with none. `test/start.test.js`.

- **2026-11-02 — The mass driver** (`massdriver.js`). A coil gun, and the
  first weapon that has to obey the game's physics. Astra's ruling on
  shields: "50% of the slug's damage to the hull and 50% to the shield ...
  residual static charge on the projectile after electromagnetic
  acceleration" — so half of every hit is charge a shield can catch and
  half is a slug it cannot (`split` in `splitDamage`; charge the shield
  cannot hold goes through too). The rest are Claude's first numbers:
  - **It travels**: 8 km/s on top of your own velocity, no falloff, 30
    damage every 1.6 s. Nothing is hit when you fire; it lands when its
    flight says, and a miss flies on for 20 s (160 km) and can hit the next
    ship along the line.
  - **A lead pip**: with a driver fitted and a ship locked, a diamond at
    the intercept point, a dashed line to it from the target, and the
    slug's flight time. Nothing when they are outrunning a slug.
  - **Recoil**: every shot pushes you back down the nose by the slug's
    momentum over your mass — about 2 m/s a shot on a 95 t Kestrel.
  - **Ammunition with mass**: slugs ride in the hold, 25 kg a round, forty
    to the tonne, 480 cr a tonne at any outfitter while a driver is fitted.
    Dry, it clicks and says where to get more.
  - Runs cool (3 heat a shot), its own sound, a white-hot slug drawn where
    it actually is with a short streak of its motion relative to you, and a
    spark where it strikes. 7,400 cr, needs development 0.5.
  - It carries the time its position is for, so a slug fired inside a frame
    is never tested a frame behind (the hunters' and torpedoes' bug).
  - A missed slug never goes on an orbit: Astra ruled it out ("we could
    very quickly end up with a Kessler syndrome"). Rounds are frangible —
    the charge cracks them to dust after their 20 s.
  - **Syndicate and navy only** (Astra: "mass drivers are a syndicate/navy
    only weapon"). Sold on the Syndicate's own turf to anyone they trust
    (50+), and in lawful space only where the navy keeps an armoury — a
    fleet carrier, or a shipyard in a system with a naval garrison — to
    50+ standing with that faction; nowhere else is it on the shelf.
  - **They carry it**: the navy (hunters included) and the Syndicate's
    enforcement wing fire slugs instead of their lasers — 26 a round every
    1.8 s, led at where you will be, with a gunner's spread that widens the
    faster you cross their sight. A ship that holds its course is hit; one
    that jinks after the shot is not. Their slugs are tested against you
    only. The enforcers' muon beam is retired; scanners read "mass driver".
  - test/massdriver.test.js (22 checks): the split, recoil, the round spent,
    travel time, the gap coasted, a crossing target missed when aimed at
    and hit when led, buying slugs and every refusal.

### Changed

- **2026-11-02 — The market review, part two: every port has a signature.**
  Astra asked that every port have a major and a minor import and export.
  Measured, almost all already did; the real fault was the other end — half
  of all ports listed 8+ imports, a third 8+ MAJOR ones, so the board stopped
  saying what a place is. Now, as the last market pass of every system
  (`Economy.applySignatures`, after fuel haulage, the giant plants and the
  licence, which all rewrite rows):
  - by trade value, the top export and top import are the port's MAJOR
    (full price signal, held to at least 0.78x / 1.22x base), the second on
    each side its MINOR (0.88x / 1.12x), and everything else keeps 40% of
    its signal: still made, still sold, priced near list;
  - **essentials are never softened as imports**: food (grain, livestock,
    fish, fruit), fissiles for the reactor and hydrogen keep at least minor
    strength wherever a port needs them;
  - a port short of two on a side promotes the row that leans hardest that
    way; a skimmer (hydrogen and nothing else) flips the need it comes
    closest to meeting into a minor export. Measured after: 0% of ports
    with no major export or import, 0.7% with fewer than two exports (pure
    consumers with nothing made to promote), 0% with fewer than two imports;
  - the market screen prints it beside the name: EXPORT / IMPORT in capitals
    for the major, lower case for the minor, "needs" for an essential.
  - Founded stations get the same pass.
  - Computers were still a glut (41% of ports made them, 14.5% bought):
    mining heads, refineries and reprocessing plants now buy them. 50% now.
  - The market colours' cut-offs re-measured the same way (sixty systems,
    quartiles and twentieths): an ask is news under 0.73x base (was 0.50x),
    a bid over 1.34x (was 1.62x). The economy tests' ramp checks now read
    the ramp's own ends rather than the old numbers.
  - `holdings.js` KIND_MEDIAN re-measured again (books read `local`).

- **2026-11-02 — The market review, part one (Astra: "do a meta-analysis
  of our current market and suggest changes", then "start on your
  recommendations").** Measured over 3,043 ports in 229 systems with the new
  `tools/measure-markets.cjs`; the review itself is `claude/market-review.md`
  in the project.
  - **Seven goods had no buyer anywhere** (livestock, timber, fish,
    textiles, fusion cells, AI cores, gene therapies), so they could only be
    sold back to a producer. Now: livestock and fish are eaten past
    subsistence (dev > 0.45), most at highports and carriers; timber builds
    developing worlds (0.2-0.65); textiles go anywhere with people; fusion
    cells go to shipyards and carriers; AI cores to shipyards and highports;
    gene therapies to farms (seed stock) and highports; medical supplies
    also to mining heads and refineries, where people get hurt. Every one
    of them now has buyers at 7-50% of ports.
  - **AI cores and gene therapies are thin buyers**: a 24 t shelf floor and
    a price ceiling of 1.12x base where they are newly wanted, because at
    the ordinary rules they measured 2,669 and 2,448 cr/t of margin, double
    luxuries. Now 1,745 and 1,656, beside luxuries' 1,589.
  - **Farm machinery is a farm import again.** The test was "has a grain
    row", which every port has (everyone eats), so 98-100% of mining heads,
    refineries and reprocessing plants bought tractors. It now asks whether
    the world can farm.
  - **Shipyards buy hull metal.** They were biased to make alloys and 99.6%
    exported them; now every yard imports alloys (1.8x the old draw as
    appetite), and a younger yard (dev < 0.7) buys ore as well.
  - No seed's universe moves except through these rows: every new amount is
    the port's own hash, rows this creates take their shelf numbers from
    the hash too, and the farm and shipyard draws are still taken where they
    always were.
  - `holdings.js` KIND_MEDIAN re-measured against the new books (shipyard
    3.45 -> 0.91, farms roughly halved, reprocessing up); distress is still
    7.5% of plants in clean systems against 24.1% in corrupt ones.

- **2026-11-01 — Pirate space has a comsat (Astra: "pirates should have
  the comsat for the syndicate that runs their territory").** A pirate band
  runs no police, so a pirate-held system had no authority channel at all,
  and the mayday, the tow and PLANT in COMMS went with it. The band answers
  to the Syndicate it is parented to, so that Syndicate's comsat is now the
  channel there: status and standing, settling what you owe it, both
  maydays, the tow and PLANT. The Syndicate's own systems had the same hole
  and get the same channel. One channel per Syndicate, and only where it or
  one of its bands holds a port. It does not take crime reports. (screens.js
  `commsContacts`; render.test "the Syndicate comsat".)

- **2026-11-01 — Weapons fire, by kind (Astra: "for the pulse and
  intermittent laser, we want bolts. For the beam laser we want a beam").**
  A pulse laser fires one bolt; an intermittent fires a burst of three; a
  beam laser (the mining laser included) is a continuous, thicker beam with
  a white-hot core, a wide halo and a slight flicker, glowing at the
  emitter and at whatever it is burning. Every bolt now has a white core,
  a bright knot at its head that shrinks as it flies (from the seat a bolt
  is at the crosshair within a frame, so the knot is what the eye follows),
  a muzzle flash as it leaves, and a flash and a spray of sparks where it
  lands. A beam held on a hull or a rock sprays the whole time; stone
  throws orange sparks whatever the beam's colour. A miss throws nothing.
  From the seat the muzzle flash spills up over the instrument deck.
  (main.js `drawCombatFx`; `Render.boltRibbon` takes a width cap so only a
  beam is allowed to be fat.)
- **NPC guns fire visible shots.** They had no birth time and a 70 ms life,
  so what showed was a stub a few percent out of the barrel. Pirates and
  freighters now fire pulse bolts, the police fire bursts, the Syndicate's
  enforcers and the navy (hunters included) fire beams; station batteries
  and your point-defence turret fire bolts. Picture only: the field is `fx`,
  not `variety`, because a gun's `variety` feeds the thermal split in
  `damagePlayer` and would have changed what their hits do.
  (`Combat.shotFx`, `Combat.npcShotVariety`.)
- **A shot at you is drawn from the seat.** It ends at your eye, which
  projects nowhere, so incoming fire was skipped in the cockpit and only the
  canopy flare showed. It now stops 60 m short and comes at the glass.
- **2026-11-01 — You can see your shield (Astra: "what effect do we have
  to show that there even is a shield around our ship?" — none, until it
  was hit; she chose all four of these).**
  - From outside, your own field shows as a faint skin whenever it is up,
    fainter as it drains. Other ships stay dark until hit, so whether a
    stranger carries a shield is still yours to find out.
  - It ripples over the hull from the nose when it comes online and again
    when it finishes recharging (the impact curve, pointed down the nose).
  - From the seat, a thin line of the field's colour runs round the inside
    of the canopy while it is up: blue full, through violet to dull orange,
    gone when it is down, brighter for a moment after a soaked hit or as it
    comes up.
  - The screen's hit flinch is red only when something got through to the
    hull. A hit the shield soaked whole flinches in the field's colour;
    before, the red drowned the blue flare that said it was holding.
- **Explosions have a fireball** under the shock rings, white at the heart
  and cooling to orange. A rock torpedo's lasts 1.6 s against a kill's 0.9.

### Fixed

- **2026-11-02 — The long white-blue bar on take-off.** Astra, climbing off
  Unysh IV b: a tapered white-blue bar detached behind the hull. It was a
  police cutter's bolts. Every NPC tracer froze both ends in absolute space
  at the instant of firing — harmless while a tracer lived 70 ms, and a
  disaster once the 2026-11-01 weapons pass gave it 0.62 s to fly: a moon
  carries both ships about 3 km a frame, so the bolts were drawn up to 30 km
  from either ship. Now both ends are live, as the player's own beams have
  been since the 25x-warp fan: the near end is the shooter's live body, the
  far end the ship it was fired at (your own, when it is you), and a muzzle
  with no body (a station battery) rides with the fight's frame
  (`Combat.shotFx` opt `{ src, t, fromVel }`; NPC fire at you, NPC against
  NPC, the turret's point defence and station batteries).
  combat.test: "an NPC's tracer stays on both ships".

- **2026-11-02 — The transfer to the exit pad went through walls in every
  procedural shed.** Astra: "the ship just clipped through walls instead of
  following the internal geometry of the station". The shed's rail took a
  45-degree incline by default, because that is what the modelled cargo
  lifts are — but nothing ever set the incline, and the shed render.js
  draws is a vertical duct over a hall 0.42 pad radii wide. So the foot of
  the shaft was four pad radii outside the hall, and the hull spent the
  drop and most of the traverse in rock. The shed's lift now goes straight
  down its own duct (`arrivalPath`); the modelled sites keep their own
  routes. `transfer.test.js` samples every pose under the ground against
  the duct and the hall.
- **2026-11-02 — No car in the lift shafts.** Astra, with a screenshot of
  a hull hanging in a shaft below the yellow platform meant to carry it:
  "no elevators in internal elevator shafts ... this needs fixed". Two
  causes. In orbit, a route that rides a lift across (the cylinder's bores,
  the cradle's and the skimmer's hoists, the spine's) boarded at the
  converter's corners, which are the shaft's air. The car can only go where
  the art's travel lets it, so it stopped as much as 0.42 radii above the
  hull. The ride's two corners are now seated on the car itself, standoff
  above its top (`Sim.seatRide`). The keel the renderer puts the car under
  is now the rail's standoff, not a fifth of a nominal hull. In a
  procedural shed there was no car at all, so one is drawn under the hull
  for the drop (`drawShedCar`).
- **2026-11-02 — Interrupting the transfer could softlock the game.**
  Astra: "if anything interrupts the 'move me to the launch pad' it
  softlocks the game". Each interruption was probed (pause, the menu, every
  panel key, held thrust, other commands, save and load, a pose that will
  not build), at a shed and at three routed orbital berths. Cruise was the
  one that broke it. Cruise is the first branch of `updateWorld`, ahead of
  the rail, so engaging it mid-transfer froze the rail and flew the hull
  out of the station: eight billion kilometres in the probe, with `arrival`
  still set, so dropping out snapped it back into the shaft. Cruise and
  the jump drive now refuse while the port has you, and say why
  (`portHasYou`). A save made in the pad hold reloads in the berth instead
  of hanging over the pad with nothing holding it.
- **2026-11-02 — Half buried and unable to climb after the transfer.**
  Astra: "it appeared that half the ship was buried in the surface and I
  couldn't gain any altitude". Measured at Oruun's ground ports: a mountain
  portal handed the hull over 50–73 m below the ground. On a heavy world
  the hand-off's 4 m/s climb was gone in two seconds, and the hull fell
  back and crashed at 43 m/s before the pilot could act. The rail now hands
  over to a hold (`Sim.stepPadHold`). The hold lifts the hull straight up
  until a hull length and 45 m of air are under it, then keeps it there
  nose-up until you thrust (or for 120 s). On the ground, a nose-up ship
  also lifts off on W, not only R. A hull whose drive cannot beat the
  world's gravity is refused the transfer at the counter, with both
  numbers.
- **2026-11-01 — A rock torpedo flew straight through the rock.** Filmed in
  the game for Astra's demonstration: launched from the panel between
  frames, the torpedo's position was one frame older than the rocks it was
  tested against for its whole flight — 0.87 km at belt speed and 15 fps —
  and it passed through the middle of a 240 m rock and coasted on. The test
  rig launched and stepped at the same instant, so it never saw it; the
  hunters had the same one-tick bug this morning. A torpedo now carries the
  time its position is for and coasts any gap before the test.
  (mining.test: "launched between frames, it still goes off on the rock".)
- **Missile smoke is no longer a grey bar across the sky.** Contrail points
  were laid in absolute space and left there, so in a belt doing 13 km/s
  round the star the trail was left kilometres behind within a second
  (doctrine 3). Each point now drifts with its frame: an atmosphere's with
  its planet, a missile's with your ship.
- **Blasts drift with what blew up.** The same doctrine-3 bug: an
  explosion stayed where it went off in absolute space, so a torpedo's
  fireball in a belt slid off the screen inside two frames. Every blast now
  carries the velocity of the thing that went up. A rock torpedo coasts, so
  it lays no smoke at all (it was a fat grey slab beside the rock), and its
  flash is drawn at its real 1 km blast radius, not 3.5 km. A pirate's rack
  cooking off is drawn at last: it had no timestamp, so its age was NaN.
- **A hull hit on your own ship no longer breaks the exterior frame.**
  Your ship has no `size` (NPC specs do), so the hull bloom's radius was
  NaN and the gradient threw, taking the rest of the frame with it. Found
  filming the shields; it uses the hull's length now.
- **One roll for an NPC's shot at you.** The picture rolled for a miss and
  the damage rolled again, so a bolt drawn wide could still hit you.

---

## 1.2.0-beta "Brian" (2026-11-01)

Named for Brian, a pigeon from the rescue. Everything below, down to Abby,
is in this release: seventeen days, from 2026-10-15 to today.

**You can get out of the chair now.** Every ship has rooms that fit inside
her own hull, an airlock and a belly ramp, and on the big ships decks, a
lift and a tram. Stations have interiors to walk, dressed Firefly by way of
Blade Runner. People are in pressure suits, every skin tone and build, and
you can talk to them. You can board another ship at a station, in space by
invitation, or by force once her drive is out.

**The sky has people in it who want things.** Every ship has a captain who
remembers you, rumours travel at the speed of ships, and a small language
model reads what you type on the band. Pirates pick the best prey and rob
it; the law runs pirates and smugglers down and arrests them; rival
empires skirmish; Syndicate runners can fire first, and then the law comes
for them. Kill enough of an empire's ships and its navy sends hunters.
Courier parcels have contents, sometimes not what the client said.

**And you can build.** Survey, claim and mine (the laser, drones, gas
skimming, ring laser ships), found a station from a Crawler and run its
books, and buy into industry. Every ship in the sky can be flown, built and
bought.

Everything that changed is listed below, by kind, newest first.

### Fixed

- **The web copy can no longer run scripts from two builds at once
  (2026-11-01).** Astra hit `error: cam is not defined` in the exterior
  view on the GitHub Pages copy. The live code was clean: her browser had
  kept a `gl.js` from 2026-10-30 (the one with that bug, fixed in
  "See-through windows on other ships") inside an otherwise current game,
  because Pages lets each file go stale on its own clock. The Pages build
  now stamps every script tag with the commit (`?v=<sha>`), so each push
  is a fresh set of URLs, and `ports.js` carries the same stamp onto the
  station art it fetches later. The build refuses to publish if fewer than
  50 tags were stamped. Running from disk or the desktop app is unchanged.

- **A hull pays out of her own purse (2026-11-01).** Selling to a hailed
  ship was limited only by her spare room, so a shuttle with six tonnes
  free would take 20,000 cr of AI cores she had nowhere to keep. Each
  hull now carries a purse for the voyage, by class (`PURSE` in
  `shiptrade.js`: shuttle 4k, liner 5k, hauler 6k, tanker 8k, freighter
  25k, bulker 70k, others 12k), and what you pay her for her own goods
  goes into it. The trade screen shows it, and when she is short she says
  it is the money, not the room. Sized by class rather than read off her
  hold because, measured over 8 seeds, most hulls with room are empty on
  the leg you meet them, which is when a captain has most cash. Saves
  survive: a voyage ledger from before reads as a full purse.

- **A rumours test sampled the exact instant a ship casts off (2026-10-31).**
  A route's period is twice its cruise plus layover, so a ship leaves her
  far port at exactly t0 + n.5 periods. `rumours.test.js` sampled at
  0.37k + 0.11i periods, which lands on a half for some k and i. Whether
  she was still berthed at that instant came down to a rounding error.
  Universal reactor demand moved the timetables, and one sample tipped
  over. The samples are now nudged off the half; the game's code is
  unchanged.

- **Her ramp, walked up or down (2026-10-31).** Astra: *"when traversing
  the ramp, ship detail flashes on screen"*, with a screenshot of a slab
  of sunlit hull standing in her airlock.
  - **What it was.** Two pieces of the hull model itself, in the way of
    the room you walk into.
    - A sloping plate over the well. Its middle was above the deck, so the
      well cut kept it whole, and its low edge hung down across the top of
      the ramp. That is the slab you walked up into. The well cut now also
      splits every plate at the deck: what is above stays, what is below
      goes.
    - Plating and greebles where her airlock room stands. They are now
      cut out of her hull per pixel, over the airlock and the whole well
      footprint, from deck to ceiling (`lockBox`), whenever she is drawn
      with her ramp out.
  - This was also today's open item, *"climbing the ramp you see the grey
    end wall of the belly well"*. The grey was the same plate.
  - Probe: `tools/probe-ramp-flash.js` walks her ramp in 16 steps with a
    shot at each one. Every step is now clean, from the hangar floor into
    her airlock.

### Saves

- **Epoch 4: existing careers do not carry over.** The pirates were split
  from the Syndicate, so the map was redrawn. Astra chose it knowing
  that: *"Bump, careers reset"*.
- **Additive: station licences, forged blanks and founded stations**
  (`licences`, `forgedBlanks`, `stations`). An older save loads with none.
  A crate in the arms at the save is back in her ring on load.

### Added

- **`\` locks what is ahead (2026-11-01).** Astra: *"we need a faster way
  to target ships and stations in front of our ship from the cockpit."*
  `[` and `]` step through every body and ship in the system in range
  order, so the freighter on your nose could be a dozen presses away. `\`
  locks the ship or station nearest the line of the nose, within 25°;
  pressing again within four seconds steps outward to the next. Planets are
  left out (still on `[ ]`), and so are ships more than a million km off.
  The message says how far, how many degrees off the nose, and how many
  more are in the cone. `Sim.aheadOf` chooses, and is tested on its own;
  `render.test.js` presses the key.

- **Naval hunters, sent after you on notoriety (2026-11-01).** PLAN.md
  Phase 9, the second half; Astra: "the navy hunters".
  - A second ledger beside your bounty, `G.notoriety`, per empire: it grows
    on REPORTED loud acts (a killing 12, a police cutter 25, a navy ship 40,
    a liner or a tender 30), halves every three days, and cannot be paid
    off. Paying your bounty clears the police; it does nothing for this.
    The Syndicate has no navy to send.
  - At 60 (three cutters in a few hours) you are told the navy has your
    name. Half an hour after you are in that empire's space, two naval
    interceptors launch from its nearest port and hunt you (three at 120).
    They open with no demand, fly the law's guns and missiles, are tougher
    than a cutter and a little faster than one. They wait out a dock and
    are never put back on a rail; leave the system and the hunt is over.
    Once a hunt ends, the next waits six hours. The same dispatch sends the
    same ships on a reload. Saves carry the ledger (additive).
  - Simulated chases (`test/hunters.test.js`, 28 checks): first hit at
    28 minutes from 16,000 km, 55 minutes from 83,000 km, 4.3 hours from
    1.8 million km.

### Fixed

- **NPCs steered one tick behind you (2026-11-01).** Found building the
  hunters, on Astra's guess. You are moved to the new time before the
  encounter loop runs; an NPC still stands where she was a tick ago until
  she steps. The station-keeping law measured her standoff against where
  you are NOW, so she settled one tick of your velocity off: about 1 km at
  60 fps (the "hovering about 1 km out" in the boarding notes), and the
  whole step at warp, which could keep a pursuer out of gun range. She now
  steers against where you were at her own time. A check that fails
  without the fix (44 km off at 1 s steps, against a 6 km standoff) and
  passes with it.
- **A hunter from far off no longer swings past you for ever.** The same
  spring law, from a million km, saturated, passed you at 300 km/s and
  oscillated. A hunter flies an intercept (closing at the speed she can
  still brake from) until she is inside her gun range.

- **Ships hold in the roads over ground ports (2026-11-01).** Astra, after
  the feeders: yes to ships lying off a port. Measured first, and the
  measure was wrong the first time: counting ships moored alongside an
  orbital station (which is out in space, on the apron), lonely orbital
  ports were already busy (empty 17% of the time). The empty ones were
  lonely ports on the ground or down a shaft, empty about 70% of the time,
  because their ships are inside and their approaches last minutes.
  - An arriving ship's crossing now ends in a holding stack 250-650 km
    over the field. She holds for half her layover (at most eight hours),
    flies a ten-minute final descent, and is then in her berth. Comms:
    "holding over Lowgate Landing, waiting on a slot".
  - Holding or descending she is not in a berth, so the berth model is
    unchanged and never counts a ship you can see outside. Rumours read
    the same hold when they work out who berthed where.
  - Your own ships, heavies, ships bound for a station you founded, and
    anything bound for an orbital port go straight in, as before.
  - Swept: no hold, lonely ground ports empty about 70%; 0.3 of the layover
    capped at 4 h, 51%; 0.5 capped at 8 h, 46%; 0.6 capped at 24 h, 42%.
    With the feeders, every port: empty 29% of the time to 20%; lonely ports
    63% to 44%. Ports with a sister port over the same world: never empty.
  - Found on the way: a signed shift in the stack's hash put some holding
    ships underground; the apron's own hash already used the unsigned one.
  - New checks in `test/berths.test.js`; `economy.test.js` now checks
    every seam of the arrival (crossing, hold, final descent) and
    nose-up at the real touchdown.

- **More peaceful ships round lonely stations (2026-11-01).** Astra:
  *"increase the number of civilian ships that we might come across that
  don't want to shoot at us."* Measured first (`tools/measure-encounters.cjs`,
  6 seeds, 93 systems, ships within 3,000 km): a port sharing her world with
  another had company 80% of the time; a port alone over her world, 44% of
  all ports, was empty 96% of the time. Feeders only ran between docks over
  the same body, so a moon station with a sister station over the planet
  below got none.
  - Twelve feeder shuttles now run between a lonely port and her nearest
    neighbour in the same planet-and-moons family (57% of lonely ports have
    one, a median million km off). Shuttles are unarmed, carry a share of
    the trade between the two, and are registered with no market, so no
    price moves and every existing route keeps every draw.
  - Lonely ports: empty 96% of the time before, 73% now. All ports: 55% to
    43%. Cost: about 0.06 ms more per traffic pass.
  - Saves survive: the new routes are additive (`ff` ids).

- **Syndicate runners can fire first, and then the law comes for them
  (2026-11-01).** Astra, in October: *"Syndicate runners don't get chased
  by cops unless they are firing on a civilian vessel as the aggressor.
  The syndicate pays off the police."* The rule was written down then, but
  nothing could break it: runners never fired on anyone.
  - A runner near you turns on 12% of her legs (seeded per leg, so the
    same leg chooses the same way on every reload), on the softest, richest
    civilian within 600 km. She fires first, with no "heave to", knocks the
    drive out, comes alongside and strips her. The victim calls it in.
  - She only picks a fight she can win: an unarmed ship, or one no tougher
    than she is. Once she has fired she carries a real gun (NPC_GUN), on
    you as on a freighter and on a scanner's readout; until then she reads
    as a freighter.
  - **And you** (Astra's call). Measured across 6 seeds
    (`tools/measure-runner-turns.cjs`), only 0.2% of runners have an NPC
    civilian within reach at any moment, because traffic lanes do not
    cross close. The civilian a runner actually meets is you, so she
    scores you the way a pirate does. Armed and tougher than her, you are
    left be.
  - Firing first marks her as the aggressor for 30 minutes. Any lawful
    cutter that sees her runs her down like a pirate ("your papers do not
    cover firing on a civilian"), and a runner chasing you drops you to
    run.
  - Shooting back at a runner who fired on you first is self-defence, not
    assault.
  - A runner who has fired on nobody is still left alone by the law.
  - 16 new checks in `test/aggression.test.js`.

- **The sealed courier parcel has contents (2026-11-01).** PLAN.md Phase
  10, built. Until now the parcel was one tonne of nothing that proved you
  reached the star.
  - What is inside is hashed off the contract (`parcelContents`, its own
    substream): mostly mundane and specific (legal instruments, medical
    samples, seed stock, a data core, somebody's ashes), sometimes
    narcotics, gold buds or restricted arms.
  - The odds lean on what the board shows: the fee's place in the courier
    band, whether the far star is Syndicate or pirate ground, and the
    crime of the system you sign in. The client and tone are drawn to
    agree with the contents more often than not. Measured over 8 seeds
    (`tools/measure-parcels.cjs`): dirty 14% overall, 1.8% for a mid-band
    fee to lawful ground out of a quiet system, 47% for the top of the
    band bound for Syndicate or pirate ground; 48% with a shady client
    against 5% with a proper one.
  - A courier contract now says when the far star is Syndicate or pirate
    ground (a true fact, and one of the tells).
  - **Customs finding it sealed** (Astra's call): the parcel is seized and
    fined, the contract is void, and your standing is left alone. You did
    not know; the seal was somebody else's word.
  - **Breaking the seal**: DETAILS on the contract, then BREAK THE SEAL,
    twice. The contract voids and the client's flag takes a standing hit.
    A dirty parcel becomes the tonne of contraband it was, and opened it
    is your crime like any other. A clean one stays aboard as a parcel.
  - **A reason to buy a scanner**: a combat scanner or better reads a
    sealed parcel through the seal, on the contract line. The hull scanner
    does not.
  - Saves survive: a contract signed before today reads as clean and
    unknown. Campaign chapters' parcels are not drawn from this table.
  - `test/parcel.test.js`, 32 checks.

- **Police interceptors burn harder in a chase (2026-10-31).** Astra:
  *"give police extra thrust for their interceptors"*.
  - A lawful interceptor running somebody down gets 1.5 times her cruising
    acceleration. That covers a fugitive she is chasing, and you, when
    she is hunting you.
  - From 30 km behind a fleeing pirate she now reaches gun range in about
    37 s at 1x, down from about 75.
  - Shadowing or inspecting, she cruises as before.
  - The Syndicate's enforcers don't get it (they already carry the better
    gun). Nor does the Navy: a warship doesn't chase, it arrives.
  - `Sim.accelOf`, `Sim.POLICE_BURN`; tested in `test/aggression.test.js`.

- **Who hunts whom: NPC aggression, the law, and standing (2026-10-31).**
  Astra: *"we need to add NPC aggression, including pirates, police
  arresting or disabling fleeing ships, and have that tie into the faction
  standing stuff."* Until now nothing in the game fought anything but you.
  New module `src/aggression.js`. Her choices:
  - **Where fights happen: near you, and off-screen as news.** Fights you
    can see are flown for real: any NPC woken within about 3,000 km of you.
    Everywhere else, a raid is rolled from the timetable (see off-screen
    raids, below).
  - **Best prey wins.** An idle pirate looks round every few seconds and
    scores every candidate within 2,500 km, you included: what her hold
    is worth, times how soft she is, over the distance.
    - Unarmed hulls and damaged ones score higher. An armed ship scores
      half; waste is worth nothing.
    - So a laden, unarmed freighter is robbed before a lean, armed ship.
    - Ships flying near a patrol lane are left alone, as they already were
      for you.
  - **A robbery.** The pirate lifts the freighter off her lane and runs her
    down. Within 15 km she calls on her to heave to, and the call goes out
    on the band.
    - The answer is seeded per pair of ships. An unarmed freighter usually
      yields; an armed one usually refuses.
    - Yielding, she gives up 60% of every line in her hold. Her port is
      short of it when she docks, saved like cargo bought off a ship. The
      pirate breaks away to sell it and looks for no one else for an hour.
    - Refusing, she is fired on, fires back if she has a gun, and sends a
      MAYDAY. If her drive goes or she strikes, the pirate comes alongside
      and strips her.
    - None of it is your crime.
  - **The law: pirates and smugglers run, and police disable and arrest.**
    - A lawful cutter or warship that sees a pirate within 1,500 km runs
      her down. The pirate drops whoever she was robbing and runs, firing
      back.
    - Cutters also check the papers of freighters passing within 400 km.
      Independent smugglers (8% of lines through a port with a fence)
      bolt. Syndicate runners are never stopped: "the syndicate pays off
      the police".
    - The law wants the crew, not the wreck. Under 15% hull, a fugitive's
      drive is shot out.
    - The cutter then comes alongside. After 20 seconds the crew is taken
      off and the ship impounded: she is gone, and her line is off the
      timetable.
  - **Standing.** Astra chose all four:
    - *HOSTILE means shot on sight.* At standing -40 or below, a faction's
      patrols open fire on you within 1,500 km, whether or not you owe them
      a bounty.
    - *Helping a victim raises standing.* Killing a ship that was attacking
      someone else: +5 with the victim's flag. Hurting a pirate badly
      enough that she breaks off: +2. Answering the MAYDAY: the existing
      +8.
    - *Helping an arrest.* Your shots in a fugitive before the law takes
      her: +3 with that force. Shooting a ship the law is already chasing
      is no crime.
    - *Interfering costs you.* Firing on a cutter mid-arrest: -10 with the
      force and -5 with the empire above it, and the fugitive gets away.
      The crime is booked as well.
    - *Rival empires skirmish.* Where two rival empires' patrols meet within
      800 km, they open fire on each other. These are border clashes, not
      a war: nobody's drive is knocked out and nobody dies. The beaten one
      withdraws at half hull, and neither starts again for an hour.
  - **Off-screen raids, as news.** In a system with pirates, a share of
    every line's arrivals has been robbed on the way in and lands 60%
    light. Her port's shelf shows it.
    - The share is 2% plus a tenth of the system's crime score, more in a
      pirate band's own space, at most 18%.
    - Closed form like the rest of the market: the same raid every time,
      with nothing to save.
    - Dock at that port within a day of it and the word is on the dock:
      *"the Halcyon Wain came in from Pilgrim Depot robbed by pirates -
      farm machinery is short here."*
    - Syndicate runners, your own lines and feeders are not raided.
  - **Steering (sim.js).** An NPC now flies at her own target, or away
    from her own threat, instead of always at you. Pursuit uses a new
    `chase` mode built on the flown approach a ship uses to come alongside
    you, plus gravity, with the target's next position predicted.
    - The old spring trailed a target that keeps accelerating by about
      250 km, so no cutter ever came within gun range.
    - A cutter's drive is about 23% stronger than a pirate's, so from
      30 km she reaches gun range in about 75 seconds at 1x.
  - **Combat.** `Combat.damageNpc` takes the ship that fired, and
    `damageNpcBy` books nothing to you. Kills and disables by somebody else
    are said aloud only when you are close enough to see them.
  - First numbers throughout. Nothing new is saved: a fight ends when you
    leave or dock, as an encounter always has.
  - **Your station defends her traffic.** Her Defence batteries now also
    fire on a pirate robbing any ship within their 25 km, as well as on
    ships that are after you.
  - Tests: `test/aggression.test.js`. Probe:
    `tools/probe-aggression.js` (a robbery and an arrest in the real
    shell).

- **Her Defence batteries fire (2026-10-31).** Astra: *"build that
  next"*. Until now a battery only held the Syndicate off on paper.
  - **What they fire at.** Ships that are after you within 25 km of her,
    whether you are flying or docked with her. In this build nothing hunts
    anybody else, so a ship hunting you is the only kind of target there
    is.
  - **An owner's switch** (Astra's choice). By default they fire on
    outlaws: pirates, the Syndicate's ships and bounty hunters. *FIRE ON
    THE LAW TOO*, under her row in YOUR STATIONS, adds police and Navy.
    Every hit on the law is an assault booked to you as her owner, with a
    witness and a hush price, the same as your own guns.
  - **A kill is yours** (Astra: *"Counts as yours"*). It goes on your
    public record, and a pirate kill counts toward lifting a pirate mark,
    the same as one by your turret.
  - **Each battery is its own mount**, firing every 1.5 s for 9 damage,
    falling off with range. Several batteries spread their fire over the
    nearest targets. A surface station's batteries alternate between her
    pad and her Crawler up top.
  - **What they leave alone.** A ship whose drive is out, or who has
    struck: a hulk you might board is not a target. They hold fire under
    time compression, the same as your own trigger. A station that has
    been seized, or is not open yet, does not fire.
  - First numbers, like the rest of her books. The switch is saved with
    her; an older save loads with it off.

- **The station leftovers: every crate does something, the Syndicate's
  cut, buying her back, and the XL shipyard (2026-10-31).** Astra: *"Build
  all the leftovers, then push."*
  - **A Defence battery holds the Syndicate off.** Each one takes a fifth
    off the odds of a sabotaged week, and adds two weeks before they can
    take her.
  - **A Comms relay brings more ships.** Her prices go out sooner: 15%
    more calls, and berth fees, for each one.
  - **A second defining crate is a second trade.** Fitted at founding or
    later (a market hall aboard a shipyard, say), she trades as both.
    - The second trade's goods are added to her floor as production
      (`Economy.addProduction`, which recomputes the row by the market's
      own rules), and her books are re-taken.
    - Her name reads both, e.g. "Shipyard & Market station".
  - **Her freight.** Whatever the Crawler carried as freight is on her
    shelves the day she opens: sold into her own market at her prices,
    onto her account.
  - **Her crew.** The Crawler's crew know the work: each point of rating
    adds 3% to her unpack and ferry rates, to half again at most.
  - **The Syndicate's cut.** In a Syndicate hold, or a system at
    corruption 60 or over, they want a quarter of her takings. Pirate
    bands raid; they don't run rackets.
    - **Pay** (INDUSTRY tab, under her account) and she runs; nothing else
      happens.
    - **Refuse** and it is slow and loud. The first week is a warning.
      After that, each week has a 50% chance (less 20% per battery) of
      being sabotaged and earning nothing. Every week you hear the count.
      After six refused weeks (plus two per battery) they take her: she
      runs on, theirs.
    - Paying again stops the count.
  - **Buying her back** (story-spine beat C, at station scale). A station
    you lost (seized, foreclosed or taken) is sold back at her own desk for
    a quarter more than she cost, plus anything she owed. The law wants a
    real licence first; the Syndicate wants only the money.
  - **Stitching: the XL shipyard.** A Crawler within 20 km of a shipyard
    of yours gets *Stitch her onto ...* on her crew channel.
    - She stops for good alongside the station, on her flank links.
    - Her crates go into the ring as upgrades, and you leave in one of
      her tugs.
    - Chains of more alternate to either side.
    - Two or more make an **XL shipyard**, drawn as the Crawlers side by
      side.
    - A shipyard you founded builds hulls up to L on one Crawler; XL hulls
      need the XL yard. Every other yard is unchanged.
  - Probe: `tools/probe-xl-yard.js` founds a shipyard, stitches a second
    Crawler on, and looks at the pair. `test/stations.test.js` covers all
    of the above (116 checks).

- **Surface stations have two halves, and Berth clamps have places
  (2026-10-31).** Astra: *"let's do surface stations as well as extra
  berths"*. Her choice for the Crawler: *"She stays up as the orbital
  half"*.
  - **The pad and her Crawler.** A station founded on a surface opens as
    two ports with one name: the pad on the ground, and the Crawler on her
    parking orbit over it as *<name> Orbital*. You dock in the Crawler's
    belly, as at any station of yours. The two halves:
    - share one market and one account;
    - go dark, are seized and are foreclosed together;
    - each count as her desk.

    Her own shuttle runs between them as a local route, and pays her no
    berth fee. Upgrades for a surface station float round her Crawler up
    top, and her shuttles ferry them down.
  - The site forecast for a surface station includes both halves, and
    matches the station founded there.
  - **Seven berths and up.** A Berth clamp is one more berth in her belly
    hangar. Past six, the two walls share the berths evenly across
    eight-tenths of the hangar, the near wall taking the odd one. The old
    layout put the seventh berth on top of the fourth. Six or fewer is
    exactly the layout every station always had.
  - A body that joins a system after you entered it gets its orbit line
    drawn the first time it is needed. The Crawler up top was throwing an
    error every frame.
  - Probes: `tools/probe-surface-station.js` founds an ore works on a
    claimed world, then shows the orbital half and the pad below.
    `tools/probe-station-crawler.js` now also berths in the seventh berth.

- **Your station's books, her reactor, growing her, and her own Crawler
  for a hull (2026-10-31).** Astra: *"keep working on it, we'll push after
  the station founding stuff is complete"*. Her choices: every port takes
  fissiles; another Crawler hauls upgrades; the station is drawn as the
  Crawler herself and you dock in her belly hangar.
  - **Every port runs a fission reactor.** Every port now buys fissiles
    for it, NPC ports included. A port in a bright sky tops up with solar
    and burns little; one round a dim star's outer moon burns the most.
    - Measured over 80 systems (`tools/measure-reactor.cjs`): every one of
      656 ports now has a fissile row (462 before).
    - The median price where fissiles are not exported is unchanged at
      1,313 cr/t.
    - The plant-to-press spread on the milfuel ladder is 501 cr/t (510
      before), and the ladder still climbs.
  - **Her week.** It is settled wherever you are, and money moves by wire.
    - **In:** her market, on what crosses her floor, and berth fees from her
      traffic.
    - **Out:** her crew's and staff's wages, upkeep on what she cost, and
      fissiles for her reactor.
    - Over 35 sites a type (`tools/measure-stations.cjs`), median net a
      week: market station +7k, refinery +11k, mining +26k, hab +33k,
      shipyard +22k. Every type has sites that lose money.
    - Her account keeps a 25,000 cr float for fuel. Anything over that is
      wired to you each week.
  - **Dark.** Her tank empty and no money to fill it: her market closes,
    her traffic stops calling, and she earns nothing while her wages and
    upkeep still run. Fuel her from your hold at her desk (free), or pay
    into her account, and she lights again.
  - **Foreclosure, slow and loud.** Every week she owes, you are told. After
    eight weeks she is foreclosed: she goes to the licensing power, keeps
    running, and pays you nothing.
  - **Will she pay?** On her crew channel, each *Found her here* row now
    carries a **FORECAST**: the station she would be at that spot, run
    through the real market and traffic code. It shows what she would earn
    and cost a week. A station founded there has the same market and berths
    as its forecast, because her numbers come from her site, not from the
    day she is founded. Asking changes nothing in the system.
  - **The INDUSTRY tab** lists YOUR STATIONS. For each one it shows:
    - building, or her week line by line;
    - her account, with PAY IN;
    - her reactor in weeks and tonnes, with FUEL HER at her own desk;
    - her upgrades and what each one does.
  - **Growing her.** A loaded Crawler within 20 km of your station gets
    *Unload her crates for ...* on her crew channel. The crates go into
    the station's ring. Her crew fits them in turn from the day they
    arrive, or you carry them in with a tug's arms. Fitted:
    - a Berth clamp is one more berth;
    - a Warehouse makes her shelves 30% deeper;
    - a Reactor pile adds 10% more trade;
    - a Fuel cell is three more weeks of reactor tank.

    A Defence battery, a Comms relay and a second defining crate are
    fitted and counted, and do nothing yet (the screen says so).
  - **She is her Crawler.** A station founded in orbit is drawn as the
    Crawler you founded her from, in her livery, with her crates in her
    cubes, fitted upgrades included. She is laid so her belly faces the
    way every station's bay faces. Her belly hangar is the bay:
    - you are cleared in through her two belly leaves, cut out of her own
      model and sliding apart to port and starboard;
    - you park on her ceiling pad;
    - collision is her own hull.

    Measured off Astra's re-export: hangar 200 x 116 x 37 m, door 58 m
    wide. The port is 478 m, her length.
  - Probes: `tools/probe-station-crawler.js` shows her flank, her belly and
    a berth inside her; `tools/probe-founding.js` still founds, carries and
    opens.

- **An arm-tip camera on the tugs (2026-10-31).** Astra: *"the tugs need
  a fwd camera on the end of one of the arms, and a screen in the cockpit
  for when there's a crate in the arms"*. A crate in the jaws fills the
  arm camera and most of the windscreen.
  - The camera rides on the end of the starboard arm, just outboard of the
    crate, looking straight ahead past it. Its screen sits high on the
    left of the canopy frame, opposite the arm camera, and is up only
    while a station crate is in the jaws.
  - It shows the Crawler you are building, with brackets round her. When
    she is off the picture, an arrow on its edge points the way.
  - The readout gives the metres left to her frame, how fast you are
    closing, and *AT HER FRAME - it goes in* once you are there.
  - Probe: `tools/probe-founding.js` now takes the tip camera facing away
    from her (the arrow) and turned to her (the brackets).

- **Founding a station from a Crawler (2026-10-31).** Astra: *"yeah,
  let's do that next"*. Her choices: a licence now, orbit and surface, a
  full port with traffic, and the arms helping build her (her crew's tugs
  unpack at the agreed rate; a crate you carry in yourself goes in at
  once). `src/stations.js`, `src/licence.js`.
  - **A licence first.** Bought on the authority channel from whoever
    governs the system, for about a mid-tier ship's price (more in a richer
    system), at WARM standing or better, and never by a marked pirate. In a
    Syndicate hold the collector sells it. A pirate band's space needs
    none.
    - A **forged blank** is sold by the Syndicate's collector in its holds
      for about a third of the real fee, and is filled in when you found.
      It is checked once a week; a clean system checks far more often than
      a corrupt one. Caught, you have a week to pay the real fee on the
      authority channel, or the station is **seized**: she stays open,
      under their flag, and is no longer yours.
  - **Founding.** Fly the Crawler there, cast off, and open her crew
    channel on the comms list (marked `*`, at the top). It offers *Found
    her here, in orbit of ...* and *Found her on the ground below*, each
    with the reason it can't be done when it can't. She needs:
    - a load that founds a type (Crew quarters, a defining crate, and what
      it needs);
    - a world below her, 500 km clear of every port and of your own sites;
    - a licence, or a forged blank;
    - for the surface: within one world radius of the ground, a mining
      claim on that world, and a shuttle in her bay.
  - **She stops for good.** In orbit she stands on the circular orbit
    through where she was. On a surface her site is the ground below her,
    and she waits on a parking orbit above it while her shuttles take the
    crates down. Her freight and her crew stay with her; your credits stay
    with you.
  - **You leave in one of her tugs** (a Bollard, or the Hawser if that is
    her only tug). That tug is off her shift while you fly it, so her
    crew works at the bay's rate less one tug.
  - **Her crates float in a ring round her**, 600 m out. Her crew unpacks
    them biggest first, at cubes per day. On a surface each one then
    waits on the shuttles' ferry rate.
    - Any crate you take in the tug's arms (G) and bring within 350 m of
      her is in at once and comes out of her crew's queue, so she opens
      sooner. The arm camera shows the crates. Let go short of her and
      her crew lines it back up.
    - The crew channel says how many crates are in, which one her crew is
      on, and when she opens.
  - **The day she opens she is a port like any other.** She has berths,
    a market of her type (market station, refinery, skimmer, mining head,
    hab as a highport, shipyard), her own dressing, and up to four
    routes of her own whose first ships leave her that day. Nobody else's
    ship moves when she opens. She is put back every time the system is
    generated or loaded.
  - Probe: `tools/probe-founding.js` founds a market station over a world
    and carries the crew quarters crate in with the arms (4 hours sooner).
    It then runs the clock to her opening and flies up to her berths.

- **A tug's grab arms, worked from the seat (2026-10-31).** Astra: *"the
  [tug's] cockpit should have a vidscreen to operate those grab arms"*.
  She chose canisters, towing disabled ships and moving station modules.
  The Bollard and the Hawser carry the arms; the Mule does not.
  - **The arm camera.** A vidscreen high on the right of a tug's canopy
    frame shows the view from the arms, just behind and above the jaws,
    looking past them. It shows:
    - what is there (her hull, a canister) and the reticle where the jaws
      meet, green when in reach;
    - the jaws closing;
    - a readout: what it is, how far off, how fast against you, and what G
      will do.
  - **G** shuts the jaws on whatever is in reach, and opens them again.
    Shift+G is still the gear. "In reach" means within 12 m ahead of where
    the jaw tips meet, 9 m ahead of the seat on a Bollard, at under 4 m/s
    against you. Closing on nothing, or too fast, says so.
  - **A canister** is held at the jaws and swung into the hold after five
    seconds. No scoop is needed: that's what the arms are for. With the
    hold full, it stays in the jaws until you let go.
  - **A disabled ship** is clamped where she was when the jaws shut. She
    comes with you, turning as you turn, and her mass is added to yours
    (`ship.armLoad`), so a tug pushing a freighter accelerates like one. A
    ship under way slips out of the jaws. Letting go leaves her adrift.
    Dock with her on the arms and the harbour takes her for **salvage at
    20 cr a tonne**. If you were seen to attack her, nobody pays: "Nobody
    pays salvage on a ship they watched you shoot."
  - **Station modules: not yet.** Founding a station from a Crawler isn't
    built (construction.js: "founding comes next"), so a module has
    nowhere to be carried to. The arms are the hands it will be built with.
  - Not saved: a load lets go of whatever the jaws held.
  - `src/arms.js` (new). Test: `test/arms.test.js` (21 checks). Probe:
    `tools/probe-arms.js`. In the real game, a lifted, disabled trader is
    clamped and towed with 0.00 m of drift.

- **Small open items (2026-10-31).**
  - **The freight office** in the cargo hall now opens the contract board
    (F7, MISSIONS), where hauls are let, instead of the market screen.
  - **The outfitter on a wall ad** (`outfitterFor`) is now the nearest
    shipyard port by where the ports actually are on their orbits. When
    ports carried no fixed position, every one measured 0 and the first
    listed won.

- **The pirates split from the Syndicate (2026-10-31).** Astra: *"Syndicate
  is mafia. Pirates are like their disposable muscle."*
  - **Three pirate bands** (`pb0`–`pb2`), with names like *The Vezor
    Corsairs* and *The Goros Reavers*. Each holds up to three systems in
    the far reaches still unclaimed after the Syndicate's holds. They
    answer to the Syndicate (`parentId: 'outlaw'`) and sit inside an empire
    (`empireId`). No waste ban, no racket. They draw from their own RNG
    stream, so the minor powers draw what they did.
  - **What a band's space is like.** Measured across six seeds:
    - It is violent and not very corrupt (violence 66, corruption 31).
      The Syndicate's space is the reverse (26 and 76).
    - Anarchy is a band's commonest government, about a third of its
      systems.
    - A band runs **no police and no customs**. Its raiders are out in
      force, two more per system.
    - **The navy crosses it far more often**, because it hunts pirates and
      cannot see a mafia.
    - The Syndicate's tithe isn't collected there, and no Syndicate heavies
      keep station. A band's ports don't wear Syndicate colours, except a
      milfuel plant licensed by the Syndicate.
    - The star chart reads *PIRATE HELD - no law, no customs, raiders*.
  - **`sys.heldBy`** is `'syndicate'`, `'pirate'` or null. `pirateHeld`
    stays true for both, so nothing that means "lawless territory" breaks.
    The Syndicate and pirate violence/corruption bonuses are now two pairs,
    +6/+22 and +26/−6.
  - `PIRATE_HOLDS`/`PIRATE_SHARE` are renamed `SYNDICATE_HOLDS` and
    `SYNDICATE_SHARE`. The literal id `'outlaw'` stays the Syndicate's.
  - Tests: `test/split.test.js` (13 checks), and three new map checks in
    `test/galaxy.test.js`.

- **The pirate mark, and framing a tug (Phase 18, 2026-10-31).** Astra
  chose to build the framing along with the mark, since the mark needs
  something to put it on you.
  - **Framing.** While a tug has you on the cable, her hold is open to
    you. COMMS (F4), on the authority channel, lists a **PLANT** row for
    each piece of contraband in your hold, worst first. Each row says what
    it would cost you.
    - Her crew are the witness by definition. They have your transponder
      on the end of their cable, so it is never anonymous, even running
      silent. The usual eight seconds to buy them off or lean on them
      apply. A Navy tender's log is sealed, as a capital ship's is.
    - The tow drops to 1x while a report is pending, or the window would
      pass inside one frame.
    - **Narcotics** are a `frame`: 1,500 cr on the bounty.
    - **Restricted arms or milfuel** are a `frameSerious`: 9,000 cr, and if
      it is reported, **the mark**.
    - **Nobody files:** the tug carries it in. At the port, customs board
      *her*, and her crew are charged.
  - **The mark is a floor, not a number.** Standing with the faction whose
    crew filed is set to −100 and pinned there. Nothing raises or moves
    it. F5 and the police channel read **MARKED n/12**, not HOSTILE, so a
    locked reputation is not mistaken for a bad one. Everything else
    (closed ports, patrols, an empty board, the yard's gates) follows from
    the standing that already exists.
  - **The road back: twelve pirate kills, anywhere.** A dead pirate
    reports itself, so no witness is needed and any space counts. Each
    pirate counts once, by its id, so a wing can't be farmed. Every
    faction holding a mark is credited at once. On the twelfth, the mark
    lifts and standing resumes at −40.
  - The mark, the pirates already credited, and the tug with what is in
    her hold are all saved.
  - Test: `test/mark.test.js` (29 checks).

- **Today's loose ends (2026-10-31).**
  - **C crouches** as well as Left Ctrl, while walking. Ctrl+W is a
    browser's close-tab, and crouching while walking forward is exactly
    Ctrl+W. Each key is tracked on its own, so letting go of one while
    the other is held keeps you down. The walking hint says *Ctrl or C
    crouch*.
  - **Seated in her, berthed in her hangar**, the windows now show the
    hangar you walk out into, not the station model's bay
    (`hangarSeat`). GPU only, as the chase view is.
  - **People in the chase view of her hangar.** The station's scene is the
    hangar deck's while you watch her there. A berth hand
    (`Berth hand`, a loadmaster) now works your hangar, posted in the
    first corner that is floor and clear of her. Test: three new checks
    in `test/hangar.test.js`.
  - **The floating label is gone.** The pointer to your home station is
    not drawn while you are docked at it. From the hangar it pointed
    kilometres off through the wall.

- **See-through windows on other ships (2026-10-31).** Astra: *"See
  through windows on other ships"*.
  - **What you see.** Within 400 m, with the GPU renderer on, a ship's
    canopy is glass. Through it you see her real cockpit: the same room,
    seat and fittings you would walk in if you boarded her, lit as
    indoors, in the place it sits inside her. This applies to traffic, a
    disabled ship you are crossing to in a suit, and your own ship from
    the chase camera or a spacewalk.
  - **How it is cut.** A hull model's glass is a dark panel on her skin,
    and on most hulls it sits a metre or more ahead of and above the
    cockpit room. So the opening is the *well* between the two: a box
    from the room's front wall out past her glass, as wide and tall as
    either. It is cut per pixel in the shader, because cutting whole
    faces either left her big forward plates standing or tore holes the
    size of them. Her glass panels near the cockpit are drawn at 32%
    opacity, and the room's own panes at 30%.
  - **Towered hulls** (Capital, Crawler) open their tower the same way
    their bridge view already did.
  - **Fixed along the way.** The shader's cut box can now have a lid
    (`uBoxTop`; unset means open-topped, as before). A mesh queued with a
    box no longer throws: the draw loop read a `cam` it did not have,
    which nothing had exercised until now.
  - **Still to tune.** The cabin reads dim through glass, because it
    uses the same indoors lighting as station interiors. The Mule's
    cockpit sits about four metres behind her canopy, so you see a deep
    well before you see the seat. Both are noted, not fixed.
  - Probe: `tools/probe-windows.js`.

- **Every ship's rooms fit inside her own hull (2026-10-31).** Astra:
  *"all ships should have interiors that exist as part of the ship
  itself"*, and they *"should follow the rules of making physical
  sense"*.
  - **How a deck is fitted.** Each hull's deck is now planned against the
    hull itself (`ShipDeck.planFitted`, asking `Render.hullFitter`
    whether a point is inside her).
    - Every room except the cockpit is sampled every half metre, at floor
      and ceiling height, a hand's width in from its walls. The cockpit's
      canopy stands proud of her skin by design.
    - The first room that is not wholly inside is dealt with, then the
      deck is planned again, until every room fits or nothing more can be
      done.
  - **What gives.** Asked, she chose *shrink, then drop*. A room is cut
    down to a size it can still do its job in, and only below that is it
    left out.
    - A side room is narrowed from its outboard wall.
    - The hold is narrowed, then given a lower deckhead (down to what two
      stacked containers need), then shortened from aft.
    - The airlock gets a narrower ramp before it gets anything else.
    - A decked hull's tramway is shortened until engineering is inside
      her.
  - **What it did, today:**
    - airlocks narrowed on the Talon, Mule, Longhaul, Tanker, Trader and
      Enforcer;
    - quarters narrowed on the Dart, Samaritan, Longhaul, Tanker, Trader
      and Crawler;
    - medbays narrowed on the Samaritan and Crawler.

    Nothing was left out of any hull.
  - **The Capital's tramway is now 6 m.** Her conning tower stands 44 m off
    her centreline, and a tram straight aft from under it left her skin at
    30 m.
  - **Measured first, and corrected.** The first measurement said only
    four hulls of twenty-three held every room. That number was wrong: it
    counted the cockpit, and a ray-parity test that her open meshes break.
    Measured against her hull above and below, most rooms were already
    nearly inside. What stuck out were outboard walls, a few corners, and
    the Capital's engineering, which was wholly outside.
  - **Seams and slots.** A point exactly on a seam between two panels, or
    in a slot under half a metre wide between hull sections (the Cutter
    has one across her belly), counts as inside her.
  - **Known:** the Crawler's lift car, on her two lower decks, runs a metre
    across an opening in her frame.
  - **Tools and tests:** `tools/interior-fit.js` reports every hull. A
    test fails if any room stands outside its hull, or if fitting ever
    leaves a room out.

- **Boarding, part 3: a disabled ship, taken by force (2026-10-31).**
  This is the third way aboard, after docking beside her at a station and
  being invited in through her tube. Astra's answers set each piece.
  - **Her drive** ("hull damage + aim"):
    - Hits on her hull also wear down her drive, and hits from within 60°
      of dead astern count double.
    - When the drive has taken two thirds of her hull's worth, she is dead
      in space. She coasts and tumbles slowly.
    - A ship that drops below 60% hull may also strike, once: often for an
      unarmed merchantman, seldom for a pirate, never for the law, the Navy
      or a warship.
  - **Calling on her to heave to.** The piracy menu has a new row, "Heave
    to — stand by to be boarded", with the odds on it.
    - Her odds go up as her hull goes down. She ignores you if you have no
      guns.
    - If she agrees, she cuts her drive and stops shooting.
    - If she refuses, she runs, and fights back if she is armed.
    - Asking is the robbery: it is reported like a demand.
  - **The spacewalk** ("fly the suit"):
    - In open space your airlock cycles out to vacuum and the ramp opens
      onto nothing. Walk off the end of it and you are in your suit.
    - **Controls:**
      - WASD, Space and Left Ctrl fire the cold-gas jets: 0.6 m/s², and a
        full pack is 30 m/s of change.
      - X brakes you against the nearest ship.
      - The mouse turns you.
    - **Safety line:** a 300 m line clipped to your own ramp. Holding H
      reels you in at 1.5 m/s and uses no gas, so running dry costs you
      the crossing, never your life.
    - **Marks:** both ramps carry a diamond and their distance. A ramp
      that is off screen gets an arrow on the edge of the view pointing at
      it.
    - **Readout:** gas, line, and your drift against the nearest ship.
    - E within 4 m of a ramp takes hold of it. Your own ramp puts you back
      aboard. Her belly door is forced open, and her ramp comes down for
      you.
    - The suit steps on the same clock as the ships. The first try used the
      wall clock, and at 55 km/s that put a quarter of a kilometre between
      you and your ramp in the first second.
  - **The standoff** ("they fight back"). Her master meets you in her
    airlock and her crew hold the inner door. You can:
    - lean on him;
    - talk him round;
    - pay him a third of her hold's value;
    - back off.

    Each way shows its odds. The answer is seeded per ship, per way of
    asking and per minute, so asking again at once gets the same answer.
    If it goes wrong, her crew throw you out of the lock, dog the door shut
    for fifteen minutes, and an armed crew start shooting at your ship.
  - **Her cargo** ("pick, they shift it"). Once she has yielded, press E
    on a container stack in her hold and her crew push it out of her
    airlock, one container every 6 s.
    - Each container comes off her manifest, the same hold every other path
      reads.
    - It goes on the charge at base price.
    - It hangs below her at 2 m/s (a jettison is 12) for your scoop.
  - The crates in a hold now carry their containers and tonnes.
  - `test/boarding3.test.js` (64 checks) covers each piece.
    `tools/probe-eva.js` runs all of it in the game, including a flight
    across on the jets.

- **Hulls are solid (2026-10-31).** Astra, watching the first spacewalk:
  *"There needs to be collision detection with ships and station walls,
  so we aren't flying through the hull of a ship like I just saw."* She
  chose collision for both the suit and the ship, and a touch that slides
  where a hit does damage.
  - **The test** is the one stations already used. It checks the PATH of
    each step against the hull's triangles as she is drawn (so nothing
    tunnels between two frames), as a bundle of five segments at the
    mover's own half-width. It is taken relative to her: where she was at
    the start of the step comes off where you were, so two ships coasting
    together are two ships sitting still. A hull with a ramp is tested
    with her ramp's well cut out, so her doorway lets you in.
  - **Your ship** now meets other ships' hulls as it meets a station's
    walls:
    - you are stopped a metre off her plate;
    - the motion into her is killed;
    - above the safe landing speed most of the rest goes too, and the hit
      costs hull as a hard landing does.
  - **Your suit** meets every hull near it, and station walls as a ship
    does. Above 2.5 m/s a hit bruises you and knocks a jet line loose,
    which costs gas.
  - **A hull you are floating beside** is no longer culled when her middle
    leaves the screen. She used to vanish at the moment you reached her
    ramp.
  - **The ship you are boarding** is drawn as a ship rather than as
    traffic: her ramp's bay is cut out, her ramp is down once it has been
    forced, and her lit airlock shows up the ramp. The mark points at her
    belly door while her ramp is up.

- **Canopies with more glass, shaped by role, unique to every ship
  (2026-10-31).** Astra: *"I want the canopy glass in the ships to give a
  better view to either side, as well as above and below, while also being
  unique to every ship."*
  - Asked, she chose:
    - **glass by role:** fighters and interceptors get near-bubble
      canopies; couriers and shuttles get generous wraparound glass;
      freighters, tugs and the big hulls get more frame and less glass, but
      still roof and lower windows;
    - **unique both ways:** each hull type has its own layout, and each
      individual ship has its own frame bars within it.
  - **Above:** there is glass in the roof either side of a spine down the
    middle of the ceiling. The overhead panel has narrowed onto that spine
    and no longer hangs across the top of the windscreen. Bubble hulls'
    roof glass runs most of the way aft; freighters' is a pair of
    skylights.
  - **To the sides:**
    - The side windows now run from the top of the side console up toward
      the ceiling, and further aft.
    - The quarter-lights beside the windscreen are taller, reaching well
      above and below where they used to stop, and they reach further round.
    - The side window now begins where the wall turns in toward the
      quarter-light, so the two read as one wrap.
  - **Below:** the landing window is wider, reaches further forward, and
    comes back under the desk toward your feet. The console slot widens to
    match, so you see all of it.
  - **The windscreen is unchanged.** It carries the HUD, and the forward
    view keeps the proportions it was tuned to.
  - **Unique per hull:** each family's sizes are moved within a band by a
    seed taken from the hull id. Three choices of shape are made the same
    way: the side window's top edge is level, tapers aft, or rises aft; the
    quarter-lights are swept or square; the roof panes are rectangles or
    trapezoids. No two hull types have the same glass.
  - **Unique per ship:** frame bars are seeded from the ship's own birth id,
    which never changes:
    - 0–2 bars across each side window;
    - 0–2 across each roof pane;
    - 0–1 across each quarter-light;
    - their width is per ship too.

    Bars never run through the middle fifth of a pane. Two Talons bought
    apart are framed apart, and renaming a ship changes nothing.
  - **Fixes found on the way:**
    - The corner where a quarter-light's wall meets the short wall back to
      the side wall left a gap that a sight line could pass through. Both
      walls now overlap there.
    - The light strips in the ceiling stop short of the roof glass.
  - Code:
    - render.js: `CANOPY_FAMILY`, `CANOPY_OF`, `canopyStyle`, `canopyBars`
      and `barQuad`; `spec.canopy` and `spec.slot`. `canopySegments` takes
      the quarter-light heights from the style. `cockpitGeometry` gains
      `roofs`, `bars`, `roofZ0`/`roofZ1`, `spineX` and `slot`, a per-hull
      `footHW`, and the side and floor windows from the style; `windows`
      now has 8 panes, with the roof's last. `apertureSet` punches roof
      panes `roof-right`/`roof-left`. The 2D path draws the bars.
    - shipdeck.js: the ceiling is framed round the roof panes; the bars are
      added to the room.
    - Tests: cockpit.test.js has 9 new checks:
      - every pane is inside its room;
      - every hull sees its whole landing window through its slot;
      - every hull has more side and roof glass than the old cockpit;
      - fighters have the most glass and freighters the least;
      - no two hulls have the same glass;
      - each ship has its own bars, the same every time;
      - bars stay out of the middle of a pane.

      shipdeck.test.js counts panes off the geometry.
    - Probe: `tools/probe-canopy.js` (ahead, port, up, down and
      starboard-up, per hull).
  - **Saves:** unaffected. Existing ships keep their old lean and trim,
    because the bars are drawn after them from the same seed.

- **The chase camera sees your hangar (2026-10-31).** Astra: *"the interior
  of the station is not visible when using the chase camera that orbits
  the ship."*
  - Seated and berthed, the orbiting camera used to show the station
    model's own docking bay: a big plain box, not the hangar you walk in.
  - Now, whenever your ship is berthed in her hangar and you look at her
    from outside, the hangar you walk in is drawn round her: the same floor,
    crates, signs and ads, with the spine through its door. The station
    model's bay is not drawn, because it would stand in the same space.
  - The camera stays inside the hangar's walls (0.6 m off walls and
    ceiling, 0.4 m off the floor), as it stays inside a station bay. You
    can't zoom out through the walls here.
  - **The hangar is bigger** so the camera has room to swing round her: 7 m
    of floor round her instead of 4, and 5 m over her instead of 2.
  - Code: main.js `hangarChase`, `clampCameraToDeckHangar` (a slab test in
    the hangar's frame), a skip in `drawBody` for the docked station, and
    `queueHangarFromShip` in the exterior view. walk.js `HANGAR_MARGIN` 7,
    and headroom height + 5. Probe: `tools/probe-chase-hangar.js`.

- **Stations by faction, wall ads, and a cargo hall (2026-10-31).** Astra:
  *"Yes, stations should vary by faction. There should be advertisements on
  the walls for the bar and outfitters, and there should be a central cargo
  area on the station."*
  - **A cargo hall** (24 x 18 m, 9 m high) now sits between the spine and
    the concourse, so every walk from the berths to the shops crosses it.
    - Container stacks (some two high) line both sides of a clear aisle,
      which is marked in dashed yellow. Hazard stripes run round the walls.
    - There is a gantry crane with its hoist and hook, a parked forklift,
      pallets of crates, and high-bay lamps.
    - Hanging signs point **^ CONCOURSE** and **^ BERTHS**.
    - **The freight office** is on the right-hand wall: a lit window with
      FREIGHT over it and a freight clerk at the counter. E there opens the
      market screen, as the market desk does.
    - Station security now patrols through the hall.
  - **Ads on the walls** in the spine, the cargo hall, the L port, the crew
    hall and your hangar. They are kept clear of doors.
    - **Bar ads** carry that station's own bar name and say DRINKS.
    - **Outfitter ads** say OUTFITTERS / SHIPYARD where the station has a
      yard. Where it has none, they say OUTFITTERS / AT and the name of a
      port in the system that does.
    - Each ad has a big **< or > arrow** at the end that points along its
      wall toward the bar or the yard counter, as you face it.
  - **Each faction dresses its own stations** (from the port's livery). The
    rooms and their layout stay the same; only the look changes.
    - **Free ports** keep the neon-and-grime look.
    - **Navy** ports are clean and blue-grey, with white light and almost no
      grime. Tall rooms hang blue banners with a white chevron.
    - **Syndicate** ports are near-black and oxblood, with gold trim round
      every room, red and gold neon, and black banners with a gold diamond.
    - **Pirate** holes are rust, with graffiti on the walls, a third of
      their light fittings dead, and twice the grime.
  - Code:
    - `dressing.js`: `STYLES` / `useStyle`, `dressCargoHall`, `placeAds` /
      `adBoard` / `wallSpans`, and `factionDetail`. `apply(plan, seed, opts)`
      now does a second pass for ads and faction marks on its own random
      stream, so the first-pass dressing of every room is unchanged.
    - `walk.js`: the cargo hall room and freight item, the concourse moved
      back by 18 m, and `FACTION_PAL` for walls and floors.
    - `main.js`: passes `livery` and `outfitter` (`outfitterFor`), and the
      freight counter.
    - `npc.js`: the freight clerk.
    - `dressing.test.js` has 14 new checks: the hall is between the spine
      and the concourse, the aisle is clear, each faction's marks are there
      and only there, the rooms are unchanged, and every station has ads.
    - Probe: `tools/probe-faction.js`.

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

- **A taller windscreen (2026-11-01).** Astra's choice from
  `unfinished.md`. The top edge rose from 0.62 to 0.70 and the upper
  chamfers from 0.30 to 0.38; the sill did not move, so the dash, the HUD
  and the landing window are where they were. The cockpit camera's view
  ends just above 0.72, and at 0.76 the glass ran off the top of the
  screen, so 0.70 halves the strip of frame overhead (9.5% of the screen
  to 4.2%) and keeps it.

- **Canopy bars wear her livery (2026-11-01).** Astra's choice. They were
  one of three near-black trims; now they are the trim she was painted at
  the yard (`paint.t`), a touch darker, or her hull's own accent, darkened,
  on an unpainted ship. Both the GPU room and the 2D painter use
  `Render.barColour`, and a repaint rebuilds the room.

- **Another ship's cabin, seen through her windows, is brighter
  (2026-11-01).** Astra's choice. It was lit like a station room you stand
  in, which from outside read as a dark well. The same indoor lamp, times
  1.8 (`CABIN_SEEN_GLOW`); every room you stand in is lit as before.

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
- **The station cutaway: a burnt-through edge, and nothing else round it
  (2026-10-30).** Shown the two lines' cut faces side by side at the same
  berth, Astra chose the mining line's: *"I want option B but let's get rid
  of all the wires and greebles and shit that currently makes it look like
  a graphics failure."*
  - **The cut face** is a hot beam-orange lip that glows, with scorched
    plate behind it. It replaces the double orange line of 2026-10-26.
  - **No furniture round the cut.** The cables and frame that stood on the
    edge, and the ring of pipes round the ship when seen from above, are
    gone. `Render.drawCutGreebles` is no longer called.
  - **The setting has two choices:** Laser cut, or Off (the camera stops
    at the wall). A saved "Laser cut - cables and frame" or "Clean cut"
    loads as Laser cut.
- **The game goes back under its own name, sigma-brightwings/Manifest
  (2026-10-30).** Astra: *"I want you to wipe the current Manifest repo and
  then push our changes"*. She chose to delete the old repo and recreate it
  empty, which frees its ~548 MB of Git LFS storage, rather than
  force-push over it, which would have left that storage in place. The
  short-lived Manifest_Main is deleted afterwards.
  - The landing page links (download, flight card, bug reports, source)
    point at sigma-brightwings/Manifest again.
  - The pushed history is the LFS-free one: the same commits and release
    tags, with models stored gzipped.
- **Web stations unpack themselves, and a missing station model says so
  (2026-10-31).** The first site off the recreated repo was published with
  Pages on "Deploy from a branch". The repo stores the station geometry as
  `src/ports/<id>.js.gz`, so every `.js` the game asked for was a 404, and
  every station drew as the old blocky procedural ring. Astra: *"why are the
  stations like this, we did so much work to not have them so blocky and
  simple"*, then *"yeah can you fix this?"*
  - **The page unpacks the packed copy itself.** When `ports/<id>.js` is
    missing, the loader in `src/ports.js` fetches `<id>.js.gz` and unpacks it
    in the browser (DecompressionStream). It then draws the real station
    the same way a late-arriving model always has. A host that sends the
    file already decoded is caught by a magic-number check. So the game
    shows its stations on any static host, not only through our Pages
    workflow, the exe or `tools/serve.js`.
  - **A failed model is no longer silent.** `PortGeo.onfail` tells
    listeners, and the game puts *Station model "<id>" failed to load -
    showing a stand-in* on the comms line, and so in the log.
  - The same loader is in the `tools/glb2hulls.js` template, so
    regenerating ports.js keeps it.
  - `test/packed-browser.test.js` (16 checks) runs ports.js as a page
    against a server that has only the `.gz` files, both plain and
    `Content-Encoding: gzip`. The page must unpack the same vertices and
    faces as the stored copy, and a station with no file must fire onfail.
- **A body when you look down, and crouching on Left Ctrl (2026-10-31).**
  Astra: *"Can we give the player first person view a body when we look
  down? And we also need to be able to crouch with L Ctrl"*.
  - **Your body** is built by the crew's generator (npcmodel.js) in a
    pilot's pressure suit and posed every frame in walk.js
    (`Walk.selfFigure`):
    - the walk cycle follows the distance you actually cover;
    - it settles when you stop;
    - it squats when you crouch.
  - **What you see.** The head is not drawn: the camera is where the eyes
    are, a few centimetres ahead of the chest. Looking down you see your
    chest harness, belt, arms, legs and boots, as a real person would.
  - **Fitted to the eye.** The body is scaled so its eyes are at the
    standing eye height (1.65 m), and its boots are put on the deck each
    frame.
  - **Where it is drawn:**
    - in your own ship, outside her on the ground, and on a station deck;
    - on the GPU like the crew;
    - on the 2D fallback through the painter's sort.
  - **Crouching** is Left Ctrl, held, eased down and back up:
    - the eye drops to where the crouched body's eyes are (about
      1.16 m), so the view and the body always agree;
    - you walk at 0.8 m/s and Shift does not run;
    - the right Ctrl is left alone.
  - **Looking down** now goes to 83 degrees instead of 69. At 69 a
    standing walker saw only the toes of their boots. The up limit is
    unchanged.
  - **Tests and probe.** `test/self.test.js` has 23 checks (crouch timing
    and speed, boots on the floor standing and crouched, eye heights,
    the head cut, the gait). `tools/probe-self.js` shoots it in your ship
    and on a station deck.
  - **In a browser,** Ctrl+W still closes the tab (no page can stop it),
    so walking forward while crouched is safe in the exe but not on the
    web build.
- **Station interiors, dressed: Firefly by way of Blade Runner (2026-10-31).**
  Astra: *"the inside of stations needs more detail: there are many rooms but
  they contain nothing"*, and asked what it should feel like, *"a kind of
  Firefly / Blade Runner aesthetic"*. That means lived in and patched, warm
  practical light against cold blue, and neon in more than one script.
  - **`src/dressing.js` (new)** dresses every room kind on a station deck:
    the bar, the concourse, the crew hall, the spine, the L port and the
    berths.
    - It is seeded from its own stream (`dress|seed|port|room`), so the
      same port's bar is the same bar every visit.
    - It moves nothing else: the rooms and doors are identical with or
      without it.
    - It adds plates to both walk.js renderers (the GPU mesh and the 2D
      painter's sort), and solid footprints that you and the people walk
      round.
  - **The bar.** Each port's bar has a seeded name, put up in neon
    (*The Drifting Lantern*, *Ivo's*, *Last Call* and so on); the name
    also shows as the room label.
    - The counter stands 1.3 m off the wall, so the bartender works
      behind it. Behind them is a back bar of glowing bottles on three
      shelves against a dark mirror.
    - Stools line the counter. There are three or four round tables with
      mismatched chairs and crates, and a red vinyl booth.
    - A warm lamp on a drop hangs over each table in place of the white
      ceiling strip. A column of glyph neon stands by the door, with
      pipes, wall ribs and grime round the room.
  - **The concourse** is a street under the station roof:
    - a noodle stand with red lanterns and stools;
    - shuttered shopfronts with glyph signs, a few with the shutter up
      and warm light inside;
    - ad panels high on the walls, and pillars with light rings;
    - an info kiosk, benches, planters and crate stacks;
    - MARKET and SHIPYARD in neon over their desks, with terminals on
      them, and a departures board;
    - hanging signs that point the way, `< BAR`, `CREW >` and
      `^ BERTHS`. Direction is always an arrow, not a word.
  - **The crew hall** has lockers, a cork job board covered in pinned
    paper under a HIRING sign, benches, a KAFE vending machine and a
    coffee urn.
  - **The spine** has hazard stripes down the floor edges and pipe runs.
    Each berth door carries its number and size in neon, coloured by
    size (L amber, M cyan, S green). Overhead signs read `^ CONCOURSE`
    one way and `^ L PORT` the other. There are fire cabinets, and
    fixtures every four metres instead of one white slab.
  - **The L port** has a yellow loading square, a gantry crane, crate
    stacks clear of the guards' posts, hazard chevrons and amber beacons
    over the outer doors.
  - **Each berth** has a yellow box on the floor in front of the hatch,
    a fuel line and hose reel, the berth number in its size colour,
    lockers, crates and a terminal by the door.
  - **People** sit on real seats: a person who sits (the Syndicate fixer)
    takes a stool, a chair or the booth. The bartender's post is behind
    the counter (`it.post`, read by npc.js `postBy`).
  - **The font** gained digits and the arrows `<`, `>` and `^`.
  - **Tests and probes.** `test/dressing.test.js` has 21 checks across
    24 generated ports:
    - every room is dressed;
    - a second visit is identical;
    - bars get their own names;
    - the plan is unmoved;
    - a flood-fill from your berth reaches every room and every usable
      thing;
    - a metre each side of every door is clear;
    - the bartender stands behind the counter;
    - every seat is in its room with floor beside it.
    `tools/probe-bar.js` and `tools/probe-dressing.js` shoot the rooms; a
    station deck draws about 6,500 plates at 57 fps.
- **Your ship in her hangar: one walk from her seat to the station deck
  (2026-10-31).** Astra: *"we want to be able to get into our ship, not
  walk into a room and use a door. I want the inside of the ship and the
  inside of the station to be a clean, walkable path."* Asked, she chose a
  hangar with her ramp over a docking collar, and the airlock open while
  she is berthed. Then, watching it: *"the ship hull needs to be cut away
  where the ramp is, because otherwise we're phasing through the hull"*.
  - **The hangar** (walk.js). The berth of the ship you are flying is a
    hangar sized to her: her length out from the spine, her beam along
    it, 4 m of floor round her, and headroom over her.
    - Her nose points away from the spine, so her ramp faces the door
      you come in by.
    - `plan.hangar` says where she stands: a rotation and a shift
      between her frame and the deck's (`Walk.hangarToShip` and
      `hangarToStation`).
    - It is dressed (dressing.js `dressHangar`) with:
      - a yellow stand line round her and a hatched box at her ramp;
      - hazard-striped walls, ribs and a gantry rail;
      - crates and a fuel bowser kept clear of her;
      - a terminal by the door and HANGAR n in neon over it.
  - **One frame** (main.js). The deck is drawn in a frame built from her
    cockpit's (`hangarFrame`), so her model, her rooms and the hangar
    floor line up exactly.
    - Walk down her ramp and at its top you are simply on the deck
      (`stepIntoHangar`). Walk up it and you are aboard
      (`boardFromHangar`). Nothing to press: the old E-at-the-hatch is
      gone for the ship you fly.
    - In the hangar you see her: her hull, engines and gear, her ramp
      down, and her lit airlock and rooms through it. From aboard, the
      hangar shows down her ramp.
  - **Her hull is solid** on the hangar floor where her belly is low,
    using the same clearance map render.js already builds for standing
    beside her on a planet. Under 1.8 m of her you stoop automatically;
    the crouch is held down for you.
  - **Open while docked** (airlock.js `ctx.berth`). Berthed in her
    hangar, her ramp comes down on its own and the inner door works, so
    there is no cycle. The panel says *Berthed - open to the hangar*.
    Undocked, the 26 October rule is back: sealed to the ship, ramp up.
  - **The ramp's cut through her hull is exact** (render.js
    `rampExterior`).
    - It used to drop only hull faces whose middle lay over the opening,
      so a big panel straddling it stayed whole and you walked through
      it.
    - Every face reaching over the opening is now clipped at its four
      edges: the parts outside are kept, the part inside and below the
      deck goes.
    - This is the same cut she uses landed, so the planet ramp benefits
      too.
  - Ships with no ramp, a tube berth, and boarding someone else keep
    the old way.
  - **Tests and probe.** `test/hangar.test.js` has 39 checks:
    - sizing, fit and headroom;
    - the two frames converting exactly, as a rotation;
    - her nose out and her ramp at the door;
    - nothing standing on her;
    - berth mode open, and sealing again on undock.
    `tools/probe-hangar.js` walks it with W alone: down her ramp onto the
    hangar floor, round her, back up and aboard.
- **The whole history without Git LFS, ready for a fresh GitHub repo
  (2026-10-30).** Astra: *"we do a fresh repo and delete the former, but
  first we test"*.
  - Every commit since the first upload stored its models as LFS
    pointers. Each of the 494 pointers is replaced by the file it
    named, so every version of every model is in ordinary git, where
    git compresses it.
  - The whole history is 160 MB, and GitHub will hold no LFS at all.
  - Same 194 commits, authors, dates and merges, and the same files
    today, byte for byte. Release tags v0.1.0-alpha5 to v1.1.0-beta are
    carried across.
  - Commit IDs from the first upload onward are new. The old line is
    kept locally as `backup/2026-10-30-master-lfs-history`, and every ref
    as it was is in `C:\Manifest-safety-2026-10-30`.
  - Built with `git fast-export | fast-import`. `git lfs migrate export`
    was tried first and given up: on this two-root history it gave the
    upload commit a parent it never had.
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

- **The ramp's glitching (2026-10-31).** Astra: *"Ensure that ramp
  structures aren't width 0."* There were two causes.
  - **Flat rails:** the rails were single flat quads with no thickness,
    so seen along their length they broke up into a line of pixels. Every
    post and handrail is now a box, and a test fails if any rail side has
    no twin across from it.
  - **Drawn twice:** from outside a ship, her ramp was drawn twice, once
    by her hull and once by her room, in slightly different units. The two
    copies fought for the same pixels. The room no longer draws it when
    you are outside.
- **Planet names over your ramp (2026-10-31).** In a suit, or on your own
  ramp in open space, the orbit chart's labels no longer draw over the
  view, as they already didn't when standing on the ground.

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
