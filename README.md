# Bitburner DOOM

A first-person DOOM-style game for Bitburner. A raycaster draws the walls, floor and ceiling as ASCII text, and
enemies are drawn with PNG sprites (or ASCII stand-ins until their art exists).

## Requirements

You can't play this right from the start of Bitburner. You need either **Singularity access** (the game then needs
under 5 GB of RAM) or **64 GB of RAM on home**.

## Install

Download or `wget` `install.js`, run `install.js`, then run `doom.js` once it has finished.

```
run doom.js
```

The game needs these files in the same place as `doom.js`: `map_rooms.txt` and `map.txt` (the two levels), `audio.json` (sounds) and
`sprites.json` (art). They are all plain text because Bitburner can only store text files.

**Tip: turn off autosave while you play.** Bitburner keeps all your files inside its save, and `audio.json` is about 24 MB, so
each autosave can freeze the game for a moment. In Bitburner's Options, set the autosave interval to 0 before you start
(File -> Save Game still works whenever you want to save), and turn it back on afterwards.

## Launch flags (cheats)

Settings are flags you add when you start the script, for example `run doom.js --godmode --allweapons`.

| Flag | Effect |
|---|---|
| `--godmode` | you never take damage |
| `--infiniteammo` | weapons never run out of ammo |
| `--allweapons` | start with every weapon and full ammo |
| `--noautoswitch` | don't switch weapon automatically when the current one runs dry |
| `--reset` | forget your points, store purchases, weapon unlocks, deaths and run history: start from zero |
| `--help` | print the list and quit |

Flags can be combined in any order. An unknown flag is reported and ignored. A web-page converter has to provide `ns.flags`;
without it every flag is off.

On the title screen use **Left/Right** to pick the difficulty (easy, normal, hard) and **Enter** or **Space** to start.

## Controls

| Key | Action |
|---|---|
| W / Up | Move forward |
| S / Down | Move backward |
| A / Left | Turn left |
| D / Right | Turn right |
| Q / E | Strafe left / right |
| F | Use (open doors, find secret walls, use an arcade cabinet; at the STORE cabinet it opens the store) |
| Space | Shoot |
| 1-7 | Select a weapon (only once you have bought it) |
| Z X C V B N | Use a consumable from your stock: **Z** Berserk, **X** Invulnerability, **C** Radiation suit, **V** Medkit, **B** Armor vest, **N** Ammo pack (the HUD hint line lists the ones you have) |
| Tab | Toggle the minimap |
| F3 | Show / hide the live performance line (fps, work per frame, enemies, projectiles) |
| F4 | Cheats only (godmode / infinite ammo / all weapons): kill every enemy at once and cancel announced spawns, so a benchmark round can be finished |
| M | Full-screen automap with fog of war (pauses the game; M or P closes it) |
| P | Pause / resume (the game also pauses by itself when the window loses focus) |
| Mouse | Turn (click the game once to capture the mouse); left click shoots |
| Enter | After dying: retry the level. After winning: play the level again. On the title screen: start (Up/Down level, Left/Right difficulty) |
| Esc | Quit (with the mouse captured, the first Esc only releases it) |

Weapons: 1 Pistol, 2 Shotgun, 3 Chaingun, 4 Rocket Launcher, 5 Plasma Rifle, 6 BFG 9000, 7 Chainsaw. You start with
only the chainsaw; everything else is bought in the store (see below). Health, armor, ammo and weapons carry over to the next level. If you die you restart the level with
the loadout your purchases give.

## The automap (M)

Opens a full-screen map and pauses the game. The outline of the level is always drawn. Rooms stay hidden until you
have seen them. The exit (if the map has one) is always marked. Pickups still lying around (a map can still contain them) show as before: keycards always, ammo and health only
within 16 tiles of you (`AUTOMAP_ITEM_RADIUS`), weapons, armor and power-ups never. Enemies are never shown. `D` is a door, `K` a locked door, `E` the exit, the arrow is you.

## Choosing a level

On the title screen, **Up/Down choose the level** and Left/Right the difficulty. There are three: **ROOMS** (square rooms, below), **ARENA** (one big room that gets harder every run, a benchmark) and **HANGAR** (E1M1, the Doom-style map in `map.txt`). Winning a level offers to play the same one again; the levels are separate maps, not an episode. Your points, purchases and unlocks are shared by all of them.

## ROOMS (the default level)

`map_rooms.txt`: seven square rooms (30 x 30 tiles each) in a snake, joined by short corridors with one door in the middle of each. You start in a plain room in the
top-left corner that holds only the three arcade cabinets (Bitburner, DOOM, and the store). The other six rooms each have an exploding-barrel scatter (nine barrels) and a
10 x 10 pool of nukage in the middle, so you have to fight along the edge. Every room except the last holds **one Arch-vile**, asleep in the corner farthest from the door; the last room holds **two**.
There is no exit: **you win by killing all seven Arch-viles.** They fall in a fixed order, each one behind a locked door: the first room's door is plain, and each Arch-vile
drops the keycard for the next door (blue, red, yellow, green, purple; see "Checkpoints"), so the doors open in that order. Keys are not for sale and do not lie on the map.
**The level is a roguelike:** the map holds no ordinary enemies, only barrels and the Arch-viles; what you fight is whatever they summon. There are no pickups at all (no health, ammo, weapons,
armor, keys or power-ups): everything is in the store (see below). The walls, floor, ceiling and sky are the stone textures from `sprites.json`; there is no decoration.

The other level is HANGAR (the second entry on the level select).

`make_rooms.py` (next to
`sprites_tool.py`, not needed to play) generates a rooms map like this one: `python make_rooms.py map_rooms.txt [seed]` (the seed changes where the barrels fall).

## ARENA (the benchmark level)

`map_arena.txt`: a small start room with the store cabinet, a door, and **one square room** (30 x 30, the size of a ROOMS room). Nothing is placed in the map: when you start, the game
scatters enemies over the big room: 16 at first plus 4 for every round, drawn from the zombies, sergeants, imps, demons, cacodemons, lost souls, barons, the three tanks and the cryobus,
plus Pain Elementals (1, then +1 every two rounds) and Arch-viles (from round 3, +1 every three rounds), which keep summoning more. **Clear the room (every enemy dead, summons and the tanks' zombies included) to win.**

**Every death AND every clear makes the next run harder** (the round is saved in `doom_progress.txt`; `--reset` zeroes it). Per round, all enemies get: **+15% hit points, +10% damage to you,
+10% attack rate** (this also makes summoners summon more often), **+5% shot speed** (up to 3x), **+5% walking speed** (up to 2.5x) and **+15% summoning**: how many enemies a summoner may have alive,
the game-wide summon cap (`TUNING.maxEnemies`) and how many it summons per cast, and a shorter warning before they appear. The numbers are `growth` in the ARENA entry of `LEVELS`; set a large round in
`doom_progress.txt` (`"arena": 60`) to jump straight to a heavy one. It is meant for finding out how much the game can take before it slows down or crashes.

### Performance log

Every run on any level is measured while you play and logged when it ends (death, win, or quitting after about ten seconds of play):

- **Terminal and end screen:** a one-line summary, for example `ARENA round 3 DIED: 21.5 fps, work 11 avg / 19 p95 / 41 max ms (budget 40), peak 120 enemies 60 shots, 4 slow frames, 0 ms dropped, first slowdown at 38s with 140 enemies`.
  *Work* is the time spent updating, drawing and updating the HUD per frame (the budget is 40 ms for 25 fps); above it the game slows down.
- **`doom_bench.txt`:** one JSON line is appended per run (version, level, round, result, seconds, kills, average fps, work avg/p50/p95/p99/max, update and render time, slow frames,
  dropped simulation time, peaks of enemies / projectiles / effects / DOM sprites / JS heap, the first second with a slowdown (fps 15% under the first seconds' fps, or work over 75% of the budget) and how many enemies were alive then. A healthy run sits near 21.5 fps rather than 25, because Bitburner's `ns.sleep` adds a few ms per frame; a stall of a second or more (for example Bitburner's autosave) is left out of the timeline, so a missing second means a freeze, and a per-second timeline
  `[second, fps, avg work, max work, avg update, avg render, enemies, projectiles, effects, DOM sprites, heap MB]`). Read it with `cat doom_bench.txt` in the terminal or copy it out of the game's
  file editor. `--reset` does not clear it. Cheat-flag runs are marked.
- **Snapshots:** every 30 seconds of play a shorter line with `"r":"SNAP"` (the last 30 seconds of the timeline) is appended too, so a crash or freeze still leaves data up to that point. The normal full line is written when the run ends.
- **F3** shows a live line (fps, work ms, enemies, projectiles) in the HUD in place of the position.

## HANGAR (E1M1)

`map.txt` is a Doom-style level: about 230 enemies (zombies, sergeants, imps, demons, cacodemons, lost souls, pain elementals, barons, tanks and a cryobus), nearly 250 pickups
(ammo, health, armor, weapons, power-ups), three locked doors with their keycards lying on the map (blue, red, yellow), a secret room (with armor) and exploding barrels.
You start in the south-east in a safe room with the three arcade cabinets (the store is one of them). The route to the exit runs west: first hall (blue key) -> blue door -> a small room ->
a cave -> the big northern caves; the red key is in the room on the north-east side, the yellow key in the room west of the middle. **The boss is an Arch-vile** standing in the cave
in front of the **exit** (far west), shielded until 20 of its summons are dead. Reaching the exit wins. The map has no decoration (add your own with the characters in the decoration table).
Killing the Arch-vile is optional but is a checkpoint (see below), and a kill counts for the store's weapon unlocks. Keys, weapons and ammo you pick up are for that run only, as before.

## Points and the store

Nothing lies around and dying grants nothing. Instead every run earns **points**: when a run ends (you die or win) its score is banked into your
points total (the end screen shows `+N POINTS (TOTAL n)`; runs with cheat flags earn none). Spend them at the **third arcade cabinet** (the one with the STORE sign, next
to the other two in the start room): face it and press F. The game pauses and a panel opens. Left/Right (or A/D) change tab, Up/Down pick an item,
Enter (or B) buys, Esc closes; or click a tab, a row or its BUY button. Purchases are kept for every later run **and** take effect at once in the run you are in.

| Tab | What it sells |
|---|---|
| WEAPONS | pistol, shotgun, chaingun, rocket launcher, plasma rifle, BFG 9000 (each starts with some ammo; you always have the chainsaw). The pistol and shotgun are for sale from the start; **the rest are locked until you kill Arch-viles:** the 1st unlocks the chaingun, the 2nd the rocket launcher, the 3rd the plasma rifle and the 4th the BFG. The best number of Arch-viles you ever killed in one run is saved, so an unlock is permanent |
| AMMO | extra starting ammo for each type (+50 bullets, +8 shells, +4 rockets, +40 cells per purchase; the price rises 25% each time) |
| SURVIVAL | +10 starting health (repeatable), +25 starting armor (up to 4 times) |
| ITEMS | consumables kept in stock (up to 9 each) and used in a run with a key: **Z** Berserk (+100 health, double damage 60s), **X** Invulnerability (30s), **C** Radiation suit (60s), **V** Medkit (+25), **B** Armor vest (+50), **N** Ammo pack (refills the weapon in your hands) |

A consumable is only used up when it would do something (not when health is full, the power-up is still running, or the weapon needs no ammo). Prices and items are
the `STORE` table near the top of `doom.js` (first guesses: tune them to how many points a run earns); the old pickup types in `PICKUPS` still exist and the
consumables reuse them.

**Enemy shots are 50% faster than their listed speed** (`TUNING.enemyProjectileSpeed` in `doom.js`, 1.5; set it to 1 for the original speed). Your own weapons are unaffected.

## Checkpoints

Every Arch-vile the map places is a checkpoint when it dies: you get **+50 health** (`TUNING.checkpointHeal`, never above 100). On ROOMS (level flag `keyDrops`) it also drops **the next keycard** (blue, red, yellow, green, then purple);
each Arch-vile's area is behind a locked door that takes the previous Arch-vile's keycard, so they can only be killed in one order and you can never be stuck without a key. On HANGAR the keys lie on the map. If you die afterwards you restart **at the start of the level** (so you can use the store first), with every Arch-vile you already killed still dead and your keys kept.
**Every Arch-vile you kill also makes all enemies tougher** (`TUNING.threat`: +10% hit points and +5% damage to you per kill, stacking, for the rest of the run; enemies already alive are toughened too, and nukage is not scaled). On ROOMS (flag `winOnArchviles`) the level is won when **every Arch-vile is dead**; HANGAR is won at its exit. Starting a new game or a new level clears the checkpoint, and it is kept only while the script runs (closing the game
forgets it; points and purchases are saved separately). Keycards used to be sold in the store; if your save has any, their price is refunded as points.

**Run history.** Every run, whether you die or win, is recorded (result, time, kills, score, and the health and weapons you started with)
and the end screen shows your last four runs as bars with the best score starred, plus totals and your fastest win. Press `H` on the end screen for
the full history (the last 16 runs, side by side). Runs played with cheat flags are marked `(cheats)` and never count as a best. The last 200 runs are kept.
Everything is saved in `doom_progress.txt` (plain JSON text) so it survives closing the script; the web page version keeps it only while the page is open.
Your points, purchases and weapon unlocks are saved there too. `run doom.js --reset` wipes it all: points, purchases, deaths and history. Pickups still work if you want them in a map: `a n o p` (ammo), `h` (health), `r` (armor), `b e w` (keys) and `2`-`7` (weapons) in `map.txt` as before.

## Map files

A level is a text file, one character per tile. Rows can be different lengths (a missing character is solid rock) and
spaces are empty void. Rows wrapped like `"#....#",` (copied out of a JS array) are accepted: the quote and comma are
ignored.

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` | wall | `.` | floor |
| `%` | brick wall | `&` | tech wall |
| `~` | nukage (damaging floor) | `P` | player start |
| `E` | level exit (the first level has none now: it is won by killing its Arch-viles; the tile still works in other maps) | `S` | secret wall (press F next to it) |
| `D` | door | `K` `R` `W` `F` `Q` | blue / red / yellow / green / purple key door |

**Pickups**

| Char | Item | Char | Item |
|---|---|---|---|
| `a` | bullets | `h` | health |
| `n` | shells | `r` | armor |
| `o` | rockets | `b` `e` `w` `f` `q` | blue / red / yellow / green / purple keycard |
| `p` | cells | `v` | invulnerability |
| `s` | radiation suit | `x` | berserk |
| `2` `3` `4` `5` `6` `7` | shotgun, chaingun, rocket launcher, plasma rifle, BFG 9000, chainsaw | | |

**Enemies**

| Char | Enemy | Notes |
|---|---|---|
| `z` | Zombie | shotgun pellets and a weak bite |
| `i` | Imp | fireballs and a claw |
| `d` | Demon | melee only, very aggressive; wakes when you open a door into its room |
| `c` | Cacodemon | hovers and shoots |
| `l` | Lost Soul | flies at you, explodes when killed |
| `g` | Chaingunner | fast bursts of bullets |
| `Z` | Zombie Sergeant | tougher shotgun zombie: a wide blast of seven pellets |
| `B` | Baron of Hell | tough, green fireballs and a claw |
| `m` | Cryobus | slow ice Mancubus: two fireballs per attack, one out of each arm; a hit freezes you in place for 3 seconds (you can still turn and shoot) |
| `Y` | Cyberdemon | boss, rockets |
| `M` | Spider Mastermind | boss, chaingun (a stream of single bullets) |
| `L` | Pain Elemental | spawner: summons Lost Souls (a fire spike warns where each one will appear) |
| `V` | Arch-vile | spawner: summons a random enemy (not a zombie, zombie sergeant, lost soul or another Arch-vile: the tanks and the Pain Elemental already make those), with a fire-spike warning. The three tanks count as one entry in its roll (`spawnGroup: 'tank'`): when that entry comes up, one of the three is picked at random. It teleports around its room: whenever you come within 7 tiles of it (at most once every 2 seconds), and by itself every 10 seconds or so (`teleport` in its entry). Asleep until you open a door into its room (or see it); from then on it summons non-stop and wanders its room, even when you are far away, and what it summons hunts you for good. **Invulnerable until 20 of its own summons are dead** (a message shows how many are left). |

Summoned enemies count like any other: their points go into your score and they add to your kills (and to the kill total on the end screen). A spawner never has more than a few alive at once (`maxAlive` per spawner: 4 for the Arch-vile, 8 for the Pain Elemental), and `TUNING.maxEnemies` (40) caps all summoned enemies alive together. Each destroyed tank (the zombie, missile and plasma tanks) releases 4 enemies, each randomly a zombie or a zombie sergeant (`onDeath.spawn` with `count: 4`), and those are not capped. To put an ordinary enemy on the map, just use its letter in `map.txt` as before.

**Scenery**

| Char | Object | Notes |
|---|---|---|
| `0` | Exploding barrel | shoot it (3 hits with the pistol) and it explodes, hurting everything within 3 tiles: you, enemies and other barrels (they chain). Damage is highest in the middle and walls give shelter. Its own explosion frames play first, then the tanks' big fireball (`Tank_Explosion`, set by `art`/`after` in its `onDeath.explode`). Enemies it kills count as your kills; the barrel itself gives no kills or points. It blocks movement. |

**Decorations** (static, cosmetic, can't be shot; each one is a single picture)

| Char | Decoration | Blocks movement? |
|---|---|---|
| `t` | Impaled body (on a spike) | yes |
| `j` | Pile of skulls | yes |
| `u` | Candelabra | yes |
| `k` | Burning barrel (animated flames) | yes |
| `T` | Red torch (animated flames) | yes |
| `U` | Tech lamp | yes |
| `X` | Staked corpse | yes |
| `G` | Gore pole | yes |
| `H` `J` `N` | Three different bodies hanging from the ceiling | no, you walk under them |
| `1` | Bitburner arcade cabinet: face it and press F to open the web version of Bitburner over the game (see below) | yes |
| `A` | DOOM arcade cabinet: face it and press F to play the original DOS DOOM (shareware episode, from the Internet Archive) in an overlay | yes |
| `C` | STORE arcade cabinet: face it and press F to open the store (see "Points and the store") | yes |

To add your own, copy an entry in `DECORATIONS` in `doom.js` and give it an unused map character. Two options change how
a decoration looks: `anim: 120` makes it animated (milliseconds per frame, any number of frames, and each copy on the map
starts at a different point), and `hang: true` hangs it from the ceiling. Decorations stand on the floor by default (bottom edge on the floor line);
`float: true` leaves one floating at eye level instead. `use: 'terminal'` (opens Bitburner), `use: 'doom'` (opens DOS DOOM), `use: 'store'` (the store) or `use: 'soon'` (OUT OF ORDER) makes a decoration usable with F.

**The Bitburner cabinet (`1`).** Stand close and face it (a message says PRESS F TO PLAY, or PRESS F TO SHOP at the store) and press F: the game pauses
and `https://bitburner-official.github.io/` (change it with `TUNING.terminalUrl`) opens in a frame over the page. The
game ignores the keyboard while it is open, so you can type in Bitburner; close it with Esc or the [X] button
(Esc typed inside the frame doesn't reach the game, so use the button then). If the page stays blank the site was
blocked from loading in a frame (the desktop app can do that); the header has an [open in a tab] link for that case.
The web version keeps its own save, separate from your Steam one. **The DOOM cabinet (`A`).** Same overlay as the Bitburner one, but it loads the Internet Archive's playable copy of the shareware episode
of the original DOS DOOM (`TUNING.doomUrl`; the [open in a tab] link goes to its details page). The Archive runs it in an emulator inside
the frame; click the frame once so it gets the keyboard. The game itself is not stored in this project, only the link. The DOOM page is loaded in a fixed 640x600 frame (`TUNING.doomFrame`; 640 is the width the Archive draws the game at, against the left edge of its frame) and scaled to fit the overlay, so the game is centred instead of sitting in a corner; set `doomFrame: null` to stretch the frame instead. If the frame
stays blank, use the tab link. All three cabinets are the same flame machine with a different sign and screen. They use `Arcade_Bitburner_idle1`,
`Arcade_Doom_idle1` and `Arcade_Store_idle1` (`Arcade_Soon_idle1` is unused now) (85x170 pixels each, `scale: 0.32` in `DECORATIONS`; picture height x scale
should stay near 54 to keep them about 0.6 of a wall tall).

The levels are the map files listed in `LEVELS` near the top of `doom.js` (the title screen's level select shows them; add a line and a file to add one). Enemies hunt you: they chase where they last saw or heard you, find a route around walls,
and open ordinary doors (not locked ones).

## Adding content (modding)

Everything you would normally edit is in the "GAME DATA" tables near the top of `doom.js` (`LEVELS`, `TUNING`, `KEYS`,
`WEAPONS`, `PICKUPS`, `PROJECTILES`, `ENEMIES`). The engine has no per-monster special cases, so new content is usually
just a new table entry. Each table has a comment explaining its fields.

**Add an enemy**

1. Copy an entry in `ENEMIES`. Its key (for example `ARACHNOTRON`) is also its sprite type: `sprites.json` needs
   `Arachnotron_walk1`, `Arachnotron_attack1`, `Arachnotron_death1` and so on. Case and underscores are ignored when
   matching, so `Lost_Soul_walk1` belongs to `LOSTSOUL`.
2. Give it an unused `mapChar` and put that character in a map. The game warns at startup if a character is used twice.
   Enemies stand on the floor by default; give a flyer `render: { float: true }` to hover at eye level.
3. List the sounds it uses. They should exist in `audio.json`; a missing one is reported at startup (see Sounds below).
4. Without art it needs a `blob` (an ASCII body) so it is visible. The PNG art takes over once the sprite keys exist.
5. If it fires something new, add an entry to `PROJECTILES`. Projectile art is ONE `<Type>_projectile` image plus ONE
   `<Type>_projectile_impact` image, used when the projectile entry says `sprite: 'TYPE'`. There is no generic projectile
   art: a projectile without a `sprite` is drawn as an ASCII `blob`.
   All bullets (the `pellet` projectile: zombies, sergeants, the Spider Mastermind, the tank machine gun) are drawn in the same light grey (colour tag `\x05`).
   Several enemies can share one projectile's art (the Cryobus uses the Cacodemon's). A ranged attack can also give
   `muzzles: [-0.45, 0.45]`: one shot is fired from each sideways offset (in tiles) instead of `count` shots from the
   centre, e.g. one fireball out of each arm. A projectile can also have `freeze: ticks`: an enemy shot that hits the
   player stops them walking for that long (25 ticks = 1 second; the Cryobus uses 75). The HUD shows FROZEN with a
   countdown, and `TUNING.freezeGraceTicks` (default 50) is the window after thawing in which you can't be frozen again.
5b. Reach: with `TUNING.rangedReachView` on (the default), ranged attacks and your bullet weapons reach as far as the view
   distance (up to 32 tiles), so if you can see an enemy it can shoot you and the other way round. The `range` max of a ranged
   attack is then ignored (its min still applies); melee and spawn attacks keep their ranges. Set it to `false` to go back to
   the per-attack ranges.
6. A spawner uses an attack with `kind: 'spawn'` instead of a projectile or melee hit (see the Pain Elemental and
   Arch-vile entries). The enemy does not appear at once: a fire-spike warning (`Spawn_Warning_idle1`, `_idle2`, shared by every
   spawner) shows at the spot for `TUNING.spawnWarningTicks` (default 14, about half a second) first; ASCII sparks are used
   without that art. If the summoner dies during the warning, nothing appears.
   A spawner can also be a `summoner` (once it is active it summons without needing line of sight or range and wanders about, `wanderSpeed`) and `invulnerable: { kills }` (no damage until that many of its own summons are dead); `wakeOnDoor` makes opening a door into its room activate it. See the legend above `ENEMIES` in `doom.js`.
   Spawners also have `flee: { dist, ticks, speed }`: they run away (at `speed` tiles per tick, much faster than their normal walk) from a player they can see when closer than `dist` tiles, and for
   `ticks` ticks after every summon, so they can't just be shot while standing still. (They also have much more health.)
7. Scenery you can shoot (like the barrel) is an `ENEMIES` entry with `prop: true` and an `onDeath.explode` block
   (`hurtsEnemies` and `falloff` control who it hurts and how the damage fades).

**Add a weapon**

Copy an entry in `WEAPONS`. Give it a `key` (its number key) and a `pickupChar` (its map character). `fire` is
`'hitscan'` (instant bullets), `'projectile'` (set `projectile` to an entry of `PROJECTILES`) or `'melee'`. Name any
sound you like; until `audio.json` has it, a placeholder plays.

**Add a level**

Draw a map file using the characters above and add one entry to `LEVELS`. `install.js` downloads every level file
named in `LEVELS`.

**Add a key colour**

Add one entry to `KEYS`. Its door character and its keycard pickup character are created for you.

`PICKUPS` and `MAP_TILES` work the same way as the tables above.

## Sprites

Sprite art lives in `sprites.json` as base64 PNGs. The file is large, so please do **not** open or read it directly.
Use `sprites_reference.md` (every sprite name, the file format and naming rules) and `sprites_tool.py` (adds and checks
sprites without reading the whole file).

Each decoration needs an image named `{Type}_idle1`: `Impaled_Body_idle1`, `Skull_Pile_idle1`, `Candelabra_idle1`,
`Tech_Lamp_idle1`, `Staked_Corpse_idle1`, `Gore_Pole_idle1`, `Arcade_Bitburner_idle1`, `Arcade_Doom_idle1`, `Arcade_Store_idle1`, `Arcade_Soon_idle1`, `Hanging_Body_1_idle1`, `Hanging_Body_2_idle1`, `Hanging_Body_3_idle1`.
The animated ones (`anim` set) use as many frames as you give them, looped: `Burning_Barrel_idle1`..`3`, `Red_Torch_idle1`..`4`, 

The exploding barrel uses `Barrel_idle1`... (looped while it stands) and `Barrel_death1`... (the explosion frames).

The naming rule in one line: `{Type}_{walk|attack|death}{frame}`, plus one `{Type}_projectile` and one
`{Type}_projectile_impact` for enemies that shoot (`Imp_walk1`, `Lost_Soul_death3`, `Cacodemon_projectile_impact`).

## Walls, floor, ceiling and sky

The game can draw textured walls, floor and ceiling (or a picture sky) instead of ASCII characters. They are entries in
`sprites.json`: `Wall_idle1` (walls), `Door_idle1` (doors; key doors are tinted with their key's colour), `Floor_idle1`
and `Ceiling_idle1` (square tileable textures, one copy per map tile, drawn with perspective so they move as you walk
and fade to dark with distance) and `Sky_idle1` (a wide panorama that tiles sideways and scrolls as you turn; used on
the ceiling only when there is no `Ceiling_idle1`, e.g. for an outdoor look). A wall style can have its own picture:
`Wall_Stone_idle1`, `Wall_Brick_idle1` or `Wall_Tech_idle1` replace `Wall_idle1` for that style (all three use
`Wall_idle1` for now). Replace a picture by swapping that entry (`python sprites_tool.py add` refuses duplicates, so
delete the old key first). Leave one out and that part is drawn dark (floor/ceiling) or stays ASCII (walls); leave them
all out and you get the old ASCII look. Nukage tiles are painted as flickering green. `floorAndCeiling: false` in
`TUNING` turns all of this off (faster).

## Sounds

`audio.json` maps a sound name to a base64 WAV. If a sound the game wants is missing, a placeholder plays instead and
the game lists the placeholders in use when it starts. To replace one, add the sound's name to `audio.json`; it takes
over by itself.

## Updating, modding and running as a web page

- There is no auto-update. When the game starts it checks the GitHub repo and, if the repo's `VERSION` is higher, prints
  "New version available, run install.js to update." Run `install.js` to download the new files (it replaces `doom.js`,
  the data files and the level maps, so keep a copy of anything you edited).
- If you change the script, raise `VERSION` (also near the top of `main`) when you publish it: that is what players' version
  check compares.
- The only Bitburner-specific calls in `doom.js` are the `ns.*` ones, so a converter script can run the same file as an
  ordinary web page.

## Notes

- The balance numbers (damage, hit points, how often enemies attack) are rough and not tuned.
- Not implemented: teleporters and switches.
- Art credits: the Cryobus sprites come from the "Cryocubus" Doom mod (code Thanuris, Ganbare-Lucifer, DeVloek; sprite
  edits 00_Zombie_00, Eriance and DeVloek; base art id Software). The Arch-vile and Pain Elemental sheets were ripped by
  Grim and Harsh29 (spritedatabase.net / neuropod.net), who ask for credit.
- For people (or AI agents) changing the code: `doom.js` begins with an architecture manual covering how it is put
  together, the order things run in, and known pitfalls. Read that before editing.
