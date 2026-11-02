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

The game needs these files in the same place as `doom.js`: `map.txt` (the first level), `audio.json` (sounds) and
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
| `--reset` | forget your deaths and run history: the roguelike bonuses (extra weapons, health, ammo) start again from zero |
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
| F | Use (open doors, find secret walls) |
| Space | Shoot |
| 1-7 | Select a weapon (only once you have picked it up) |
| Tab | Toggle the minimap |
| M | Full-screen automap with fog of war (pauses the game; M or P closes it) |
| P | Pause / resume (the game also pauses by itself when the window loses focus) |
| Mouse | Turn (click the game once to capture the mouse); left click shoots |
| Enter | After dying: retry the level. After a level: go to the next one |
| Esc | Quit (with the mouse captured, the first Esc only releases it) |

Weapons: 1 Pistol, 2 Shotgun, 3 Chaingun, 4 Rocket Launcher, 5 Plasma Rifle, 6 BFG 9000, 7 Chainsaw. You start with
only the pistol. Health, armor, ammo and weapons carry over to the next level. If you die you restart the level with
what you had when it began.

## The automap (M)

Opens a full-screen map and pauses the game. The outline of the level is always drawn. Rooms stay hidden until you
have seen them. The exit is always marked, and so are keycards still lying around, even in unexplored areas. Ammo and health show only
within 16 tiles of you (`AUTOMAP_ITEM_RADIUS`), as a plain `+` (health) or `=` (ammo). Weapons, armor and power-ups are never
marked, so a big level stays readable. Enemies are never shown. `D` is a door, `K` a locked door, `E` the exit, the arrow is you.

## The first level (E1M1: Hangar)

You start in the south-east in a safe room with the three arcade cabinets (no enemies, some supplies). The route to the exit in
the far west goes: first hall (blue key) -> blue door -> a small room -> a cave -> the big northern caves. The red key is in the room
on the north-east side, the yellow key in the room west of the middle, and the exit room is behind the red door and then the
yellow door. **The level is a roguelike:** the map holds no ordinary enemies, only exploding barrels and one Arch-vile asleep in every
room (15 of them, each as far from the room's doors as it can be; the start room has none). What you fight is whatever they summon.
Every decoration and tile type appears at least once. A dead-end corridor off the east side of the second cave
leads to a secret wall (press F on it); behind it is a hidden room (its reward is armor). Two nukage pools sit in the first
hall and the big cave (a radiation suit lies near the first). Two rooms use the brick (`%`) and tech (`&`) wall looks.
There are no health, ammo or weapon pickups on the map any more (see "Roguelike progression" below); keycards, armor and the power-ups are still
lying around.

## Roguelike progression

Every time you die and start over, the next run begins stronger: **one more weapon** (you start with only the chainsaw; then the pistol, shotgun, chaingun,
rocket launcher, plasma rifle and finally the BFG 9000, after which no more are granted), **+10 health** and **more ammo** (the pistol arrives with 100 bullets and gains 25 more per death after that; each other ammo type works the same way from the death its first weapon is unlocked) of every type your weapons use, with no limit on
health or ammo. The newest weapon is selected. The end screen shows what you get next. Winning does not reset anything: the extra weapons, health and ammo carry on, and you can keep playing.

**Run history.** Every run, whether you die or reach the exit, is recorded (result, time, kills, score, and the health and weapons you started with)
and the end screen shows your last four runs as bars with the best score starred, plus totals and your fastest win. Press `H` on the end screen for
the full history (the last 16 runs, side by side). Runs played with cheat flags are marked `(cheats)` and never count as a best. The last 200 runs are kept.
Everything is saved in `doom_progress.txt` (plain JSON text) so it survives closing the script; the web page version keeps it only while the page is open.
`run doom.js --reset` wipes it all, deaths and history. The numbers are in `PROGRESSION`
near the top of `doom.js`. The pickups still work if you want them: `a n o p` (ammo), `h` (health) and `2`-`7` (weapons) in `map.txt` as before.

## Map files

A level is a text file, one character per tile. Rows can be different lengths (a missing character is solid rock) and
spaces are empty void. Rows wrapped like `"#....#",` (copied out of a JS array) are accepted: the quote and comma are
ignored.

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` | wall | `.` | floor |
| `%` | brick wall | `&` | tech wall |
| `~` | nukage (damaging floor) | `P` | player start |
| `E` | level exit | `S` | secret wall (press F next to it) |
| `D` | door | `K` `R` `W` | blue / red / yellow key door |

**Pickups**

| Char | Item | Char | Item |
|---|---|---|---|
| `a` | bullets | `h` | health |
| `n` | shells | `r` | armor |
| `o` | rockets | `b` `e` `w` | blue / red / yellow keycard |
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
| `V` | Arch-vile | spawner: summons a random enemy (not a zombie, zombie sergeant, lost soul or another Arch-vile: the tanks and the Pain Elemental already make those), with a fire-spike warning. The three tanks count as one entry in its roll (`spawnGroup: 'tank'`): when that entry comes up, one of the three is picked at random. Asleep until you open a door into its room (or see it); from then on it summons non-stop and wanders its room, even when you are far away, and what it summons hunts you for good. **Invulnerable until 20 of its own summons are dead** (a message shows how many are left). |

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
| `C` | Coming-soon arcade cabinet: placeholder, F says OUT OF ORDER (its game is not built yet) | yes |

To add your own, copy an entry in `DECORATIONS` in `doom.js` and give it an unused map character. Two options change how
a decoration looks: `anim: 120` makes it animated (milliseconds per frame, any number of frames, and each copy on the map
starts at a different point), and `hang: true` hangs it from the ceiling. Decorations stand on the floor by default (bottom edge on the floor line);
`float: true` leaves one floating at eye level instead. `use: 'terminal'` (opens Bitburner), `use: 'doom'` (opens DOS DOOM) or `use: 'soon'` (OUT OF ORDER) makes a decoration usable with F.

**The Bitburner cabinet (`1`).** Stand close and face it (a message says PRESS F TO PLAY) and press F: the game pauses
and `https://bitburner-official.github.io/` (change it with `TUNING.terminalUrl`) opens in a frame over the page. The
game ignores the keyboard while it is open, so you can type in Bitburner; close it with Esc or the [X] button
(Esc typed inside the frame doesn't reach the game, so use the button then). If the page stays blank the site was
blocked from loading in a frame (the desktop app can do that); the header has an [open in a tab] link for that case.
The web version keeps its own save, separate from your Steam one. **The DOOM cabinet (`A`).** Same overlay as the Bitburner one, but it loads the Internet Archive's playable copy of the shareware episode
of the original DOS DOOM (`TUNING.doomUrl`; the [open in a tab] link goes to its details page). The Archive runs it in an emulator inside
the frame; click the frame once so it gets the keyboard. The game itself is not stored in this project, only the link. The DOOM page is loaded in a fixed 640x600 frame (`TUNING.doomFrame`; 640 is the width the Archive draws the game at, against the left edge of its frame) and scaled to fit the overlay, so the game is centred instead of sitting in a corner; set `doomFrame: null` to stretch the frame instead. If the frame
stays blank, use the tab link. All three cabinets are the same flame machine with a different sign and screen. They use `Arcade_Bitburner_idle1`,
`Arcade_Doom_idle1` and `Arcade_Soon_idle1` (85x170 pixels each, `scale: 0.32` in `DECORATIONS`; picture height x scale
should stay near 54 to keep them about 0.6 of a wall tall).

The first level is `map.txt`. More levels are more map files listed in `LEVELS` near the top of `doom.js`; the exit of
the last one ends the game. Enemies hunt you: they chase where they last saw or heard you, find a route around walls,
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
`Tech_Lamp_idle1`, `Staked_Corpse_idle1`, `Gore_Pole_idle1`, `Arcade_Bitburner_idle1`, `Arcade_Doom_idle1`, `Arcade_Soon_idle1`, `Hanging_Body_1_idle1`, `Hanging_Body_2_idle1`, `Hanging_Body_3_idle1`.
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
