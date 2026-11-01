/**
 * DOOM — Bitburner Edition
 *
 * Controls, setup, map characters and how to add enemies / weapons / levels are in README.md.
 * The architecture manual for people and AI agents who change this file starts just below.
 */

// ARCHITECTURE MANUAL  (read first; written for humans and AI agents who maintain this file)
//
// WHAT THIS IS
//   A first-person DOOM-style game for the browser idle game Bitburner. A raycaster draws walls, floor and ceiling
//   as ASCII characters into a <pre>. Enemies, pickups and projectiles are drawn as PNG sprites layered over the
//   <pre> when art exists in sprites.json, otherwise as ASCII fallbacks. Run it with:  run doom.js
//   (A separate converter script can also run this file as an ordinary web page; the only Bitburner-specific
//   calls are the ns.* ones, so keep new code on plain browser APIs.)
//
// FILES (plain text only, because Bitburner can only store text files)
//   doom.js       ALL game code. It is deliberately ONE file (owner's requirement). Do not split it.
//   map.txt       the first level, one character per tile (legend in README.md). More levels are
//                 more map files listed in LEVELS.
//   audio.json    { "soundname": "<base64 wav>", ... }  every key is decoded at startup.
//   sprites.json  { "Zombie_walk1": "<base64 png>", ... }  key format is explained at parseSpriteKey().
//   The data files are read with ns.read() and are also what auto-update downloads and overwrites.
//
// LAYOUT OF THIS FILE
//   1. Module-level GAME DATA tables (ASSETS, LEVELS, tuning, tiles, KEYS, WEAPONS, PICKUPS, DECORATIONS, PROJECTILES, ENEMIES)
//      followed by "derived tables". Pure data.
//   2. export async function main(ns). EVERYTHING else lives inside it as closures over shared local
//      variables (see SHARED STATE). This is deliberate: each run gets fresh state and the functions can
//      read and write it without parameter passing. Consequence: functions cannot be imported or unit tested
//      on their own. To test headlessly, stub ns, document, window.AudioContext, Image, fetch and Date.now.
//
// EXECUTION ORDER (it matters; later steps depend on earlier ones)
//   Module load   GAME DATA tables -> derived tables (KEYS adds door tiles + keycard pickups; WEAPONS gets
//                 defaults, weapon pickups and WEAPON_KEYS; ENEMIES gets defaults) -> CHAR_INFO.
//                 CHAR_INFO is built LAST because it reads what the earlier steps filled in.
//   main(ns)      cheat toggles -> auto-update (may restart the script and return) -> declare map state -> read
//                 sprites.json as text (images are decoded later) -> declare game state -> build DOM -> install
//                 input handlers -> read audio.json -> TITLE LOOP (difficulty choice, waits for Enter/Space) ->
//                 preloadSprites() -> loadAllSounds() -> checkGameData() -> start music ->
//                 startLevel(0, 'fresh') -> FRAME LOOP.
//   startLevel    (re)loads one level: parseMap() builds the map arrays, then the player, enemies, pickups,
//                 projectiles and timers are reset. It is the ONLY place a level begins. See LEVEL LIFECYCLE.
//   Every frame   updateGame() zero or more times (fixed 40 ms ticks), then renderFrame() once, then updateHud().
//   End of level  gameOver / won freeze the simulation, show the end screen, and Enter calls startLevel again
//                 (retry, next level, or back to level 1 after the last one).
//   Exit          ESC, the [ESC] button, ESC on the end screen, or the script being killed all end in cleanup()
//                 (idempotent: removes the DOM, listeners, music, pointer lock and AudioContext).
//
// SHARED STATE (locals of main; most functions read or write several of these)
//   Map        tileKind[] blocked[] doorOpen[] doorPos[] doorHold[] doorKey{} wallStyle[] doorList[] MW MH
//              VIEW_DIST spawns secretsTotal. These are `let`s that parseMap() REASSIGNS on every level load, so
//              never keep a long-lived reference to one of the arrays. `blocked` is the ONLY thing that collision,
//              line of sight and raycasting consult; updateDoors() and tryUse() change it as doors/secrets open.
//   Player     px py pa (tile units, radians), health armor, ammo (an object: one number per AMMO_TYPES id),
//              heldKeys, owned, currentWeapon, powers (ticks left of each timed power-up).
//   Entities   enemies[] pickups[] decor[] projectiles[] (player AND enemy shots) effects[] (visual only) damageNumbers[].
//   Timers     shootCooldown useCooldown muzzleFlash afterglow faceHitTimer flashTimer hazardTimer: all in TICKS.
//   Automap    explored[] outline[] (per-tile, rebuilt by parseMap), automapOpen automapResume: see AUTOMAP.
//   Status     gameOver won running paused inGame levelIndex difficulty kills score secretsFound endTime gameStartTime levelStart.
//   Per frame  frameWall* typed arrays and hitSide/hitTX/hitTY, written by castRay()/renderFrame().
//   Assets     spriteCache[TYPE][anim] = [Image...], sfx[name] = AudioBuffer, audioCtx.
//   DOM        root pre spriteOverlay hud face, plus the cached nodes hudEl{} and faceEl.
//   The GAME DATA tables are module-level but NOT immutable: the derived-tables block rewrites WEAPONS and
//   ENEMIES entries, and checkGameData() replaces ENEMIES[id].attacks with a filtered list.
//
// COORDINATES AND UNITS
//   Map tiles are 1.0 wide. A tile (x, y) has its centre at (x + 0.5, y + 0.5). y grows downward (row 0 is the
//   first line of map.txt). Angle 0 faces +x (east); a larger angle turns clockwise as seen on the map;
//   the player starts facing -y (up the map). Screen: W columns x H rows of characters.
//   Gameplay time is counted in TICKS (STEP_MS = 40 ms, 25 per second): every speed, cooldown, timer and
//   probability is "per tick". Only animation frame selection (Date.now() / ms) and the end-screen clock use
//   wall-clock milliseconds. When the unit of a number is unclear, assume ticks.
//
// KEY DESIGN DECISIONS (and why)
//   Data-driven tables       Adding an enemy, weapon, key, pickup, level or wall style is a table edit, not a code
//                            edit. The engine has no per-monster branches; the only escape hatches are `speed` as a
//                            function and `onDeath`. Keep it that way: add a new field to the tables and handle it
//                            generically.
//   Map preprocessed once    A map file is turned into flat typed arrays when its level starts. Hot paths
//                            (raycasting, collision) do array lookups and never look at map characters.
//   One level-start path     startLevel() is used for the first level, next level, retry and play-again, so there
//                            is exactly one place that has to know every piece of per-level state. When you add
//                            new per-level state, reset it THERE.
//   Floor and sky pictures   Optional (see FLATS): Floor_idle1 / Ceiling_idle1 / Sky_idle1 in sprites.json are painted on a canvas UNDER
//                            the text; the ASCII floor is the fallback.
//   DDA raycasting           castRay() jumps from grid line to grid line: exact, cheap, and reports which wall
//                            face was hit (used for shading). Wall HEIGHT uses perpendicular distance (no
//                            fisheye); sprite OCCLUSION compares true ray distance, so both are stored per column.
//   Floor and ceiling        Not raycast per pixel. For each screen row below/above the horizon the perpendicular
//                            distance is a constant (FLOOR_PERP, derived from the same wall-height formula so the
//                            floor meets the wall base exactly); a column only multiplies that by 1/cos to find the
//                            world point, used for a checker pattern and hazard tiles.
//   Fixed timestep           Simulation advances in whole ticks regardless of how long a frame takes to draw, so
//                            slow rendering slows the picture, not the gameplay. MAX_STEPS_PER_FRAME stops a
//                            long stall (hidden tab) from fast-forwarding the world.
//   One innerHTML per frame  The frame is built as one HTML string (adjacent same-colour cells share a span) and
//                            assigned once; creating thousands of DOM nodes per frame is far too slow.
//   PNG overlay is a sibling PNG sprites live in spriteOverlay, NOT inside <pre>, because pre.innerHTML is
//                            overwritten every frame and would destroy them. The render box size is measured from
//                            the real font at startup (fitRenderBox) so the overlay lines up with the characters.
//   Enemy awareness          Enemies are not omniscient: they react to what they SEE (line of sight inside `sight`),
//                            what they HEAR (alertEnemies() on every shot) and what they REMEMBER (the last place
//                            they saw/heard the player, e.memX/memY/memTicks), and when they can't see where they are
//                            going they follow an A* route (findPath/followPath) instead of pushing against walls.
//   Spatial sound            Sounds that happen in the world use playAt(): volume falls off with distance, is
//                            halved behind walls and is panned left/right. Sounds that belong to the player (own
//                            gun, pain, pickups) use play() directly.
//   eval('document'/'window') Bitburner's RAM calculator charges heavily for the identifiers `document` and
//                            `window`. eval hides them from the static check. Do not replace with direct use.
//   Graceful degradation     Missing sounds fall back to placeholders or silence, missing sprites fall back to
//                            ASCII, bad table entries are reported once at startup (checkGameData) and
//                            disabled instead of crashing mid-fight.
//
// WHERE TO CHANGE WHAT
//   New enemy / weapon / key / pickup / projectile / sound   the tables in GAME DATA (and audio.json / sprites.json).
//   New level              a map file plus one entry in LEVELS. Nothing else.
//   Balance / feel         TUNING, DIFFICULTIES, AMMO_TYPES, and the per-entry numbers in the tables.
//   New HUD stat           the HUD template in DOM SETUP + the id list for hudEl + updateHud().
//   New tile type          TILE and TILE_IDS, MAP_TILES, the `blocked` rule in parseMap(), the wallTile handling in
//                          renderFrame(), floorCell() if it is a floor type, the minimap block, and tryUse() if usable.
//   New wall look          one entry in WALL_STYLES plus a MAP_TILES character that names it.
//   New colour             a tag character in CELL_COLORS (see the notes there).
//   Per-level state        reset it in startLevel().
//   Screen size            W, H and the font. The render box is measured automatically; the 660x368 values in the
//                          DOM setup are only the fallback used when measuring is impossible.
//   Releasing a change     bump the VERSION constant (see AUTO UPDATE for how that is read and why it matters).
//
// KNOWN PITFALLS (details are next to the code they affect)
//   * Auto-update overwrites doom.js AND map.txt, audio.json, sprites.json and every level map named in the
//     repo's LEVELS with the repo's copies whenever the repo's VERSION is higher. Local edits to those files
//     are lost on that run. Run with --noupdate to develop.
//   * Auto-update finds the level maps by running a regex over the repo's doom.js looking for the property name
//     map followed by a colon and a single-quoted file name. Write level maps in that form, and do not use that
//     form for anything else.
//   * The remote VERSION is located with a regex on the declaration line of the VERSION constant (const, name,
//     equals sign, single-quoted string). Keep that declaration form, and never write a line of the same shape
//     earlier in the file, comments included, or auto-update will read the wrong number.
//   * Colour tags in grid cells are control characters; each must be unique (see CELL_COLORS) and every glyph a
//     cell can hold must be a single UTF-16 unit (no emoji), because cells are split with slice(1).
//   * Function declarations inside main are hoisted but the const arrows and tables (angleDiff, canFire,
//     CELL_COLORS, COLS_PER_TILE, FLOOR_PERP, escapeHtml, wrapRun, STEP_MS ...) are not. All definitions currently
//     come before the first call (the title loop); do not call anything earlier than where its const is declared.
//   * Sprite type names are matched after removing underscores and upper-casing; see parseSpriteKey().
//   * Ammo is per type (AMMO_TYPES); a weapon names its type with ammoType (null = needs no ammo).
//   * Doors are passable from half open (doorPos >= 0.5) and auto-close after TUNING.doorAutoCloseTicks.
//     Anything that must not be crushed has to be checked by doorOccupied().
//   * Enemy path-finding is on the tile grid and only used when an enemy can't see its goal (see followPath). It
//     treats unlocked doors as passable and locked key doors/secrets as walls, searches at most 3000 tiles, and is
//     limited to 2 searches per tick in total; an unreachable goal gets a route to the closest reachable tile.
//     Enemies that CAN see you still walk straight at you, so a pillar between you can stall one briefly.
//   * The balance numbers (damage, hp, chances) are rough and not tuned.

// ════════════════════════════════════════════════════════════════════════════
//  GAME DATA
//  Everything you would normally edit lives in this block. The engine below reads these tables and has
//  no per-monster / per-pickup special cases.
//
//  How to add an enemy, weapon, level or key colour, and the map character legend, are in README.md. Two rules to
//  keep in mind while editing: an enemy's table key is also its sprite type (see parseSpriteKey), and every mapChar /
//  pickupChar / doorChar must be unique across all tables (the game warns at startup about duplicates).
// ════════════════════════════════════════════════════════════════════════════

// Where the data files live (paths inside the game's home folder, and inside the repo for auto-update)
// These names are used in three places: ns.read() at startup, the list auto-update downloads, and the
// messages checkGameData() prints. They live on the same server as doom.js ('home').
const ASSETS = { map: 'map.txt', audio: 'audio.json', sprites: 'sprites.json' };

// ─── SPRITE ALIASES ─────────────────────────────────────────────────────────
// Lets two sprite names share ONE image in sprites.json, so identical art is stored once. Format:
// 'name that is NOT in sprites.json': 'name that IS'. preloadSprites() copies the target's image under the alias
// name before the frames are grouped, so the alias behaves exactly like a real entry (it can be a frame of a walk
// or attack animation, an impact, ...). To share an image: delete the duplicate key from sprites.json and add a line.
// An alias whose target is missing prints a warning; an alias that also exists in sprites.json is ignored (the file wins).
const SPRITE_ALIASES = {
  'Lost_Soul_attack2': 'Lost_Soul_walk2',               // second attack frame is the same picture as walk frame 2
  'Lost_Soul_projectile_impact': 'Lost_Soul_death5',    // the skull's impact flash is its last death frame
};
// ─── LEVELS ─────────────────────────────────────────────────────────────────
// Played in order. name: shown on the level banner and end screen. par: seconds shown as the par time.
// Each map is a text file in the same folder as doom.js. Health, armor, ammo, weapons and score carry over to
// the next level; keys, power-ups, kills and secrets do not. Dying restarts the level with what you had when
// it began. To add a level, copy the line and name your file.
// (Auto-update looks for the property name `map` + a colon + a quoted file name in this repo's doom.js to know
// which map files to download, so keep that spelling.)
const LEVELS = [
  { name: 'E1M1: HANGAR', map: ASSETS.map, par: 180 },
];

// Names of the sounds the game itself plays (keys in audio.json)
// Only the sounds the ENGINE itself triggers. Enemy, weapon, pickup and projectile sounds are named inside their
// own tables. All of them are looked up by name in audio.json by play(); see SOUND_FALLBACKS.
const SOUNDS = { hurt: 'playerinjured', death: 'playerdeath', door: 'door', music: 'level', weaponPickup: 'weaponpickup' };

// PLACEHOLDER SOUNDS. If the sound on the left is not in audio.json yet, the one on the right plays instead.
// To replace a placeholder, just add the left-hand name to audio.json (base64 wav): it takes over by itself.
// The game prints the list of placeholders still in use when it starts.
const SOUND_FALLBACKS = {
  // (none right now: every sound the game asks for is in audio.json. To use a placeholder for a new sound, add a line
  // like  newthingdeath: 'demondeath',  here.)
};

// Starting stats and the most you can carry of each
// Ammo is kept per TYPE (AMMO_TYPES); each weapon names the type it uses in `ammoType`. STAT_MAX caps health and
// armor; ammo caps are in AMMO_TYPES. Nothing else enforces these caps.
const START = { health: 100, armor: 0, weapons: ['pistol'] };   // weapons you begin with; starting ammo is AMMO_TYPES[].start
// Ammo types. start/max are in rounds. A weapon uses one of these ids as its ammoType (null = no ammo needed).
const AMMO_TYPES = {
  bullets: { name: 'BULLETS', start: 50, max: 200 },
  shells: { name: 'SHELLS', start: 0, max: 50 },
  rockets: { name: 'ROCKETS', start: 0, max: 50 },
  cells: { name: 'CELLS', start: 0, max: 300 },
};

// Difficulty, chosen on the title screen with Left/Right. damageTaken scales everything that hurts the player,
// enemyHp scales enemy hit points when a level loads, enemyChance scales every attack's per-tick chance,
// ammoPickup scales the ammo found in pickups.
const DIFFICULTIES = {
  easy: { name: 'EASY', damageTaken: 0.5, enemyHp: 0.75, enemyChance: 0.75, ammoPickup: 2 },
  normal: { name: 'NORMAL', damageTaken: 1, enemyHp: 1, enemyChance: 1, ammoPickup: 1 },
  hard: { name: 'HARD', damageTaken: 1.5, enemyHp: 1.5, enemyChance: 1.5, ammoPickup: 1 },
};
const DEFAULT_DIFFICULTY = 'normal';

// General tuning. Times are in ticks (25 per second) unless the name says otherwise.
//   mouseLook / mouseSensitivity   pointer-lock turning (radians per pixel of mouse movement)
//   floorAndCeiling                false = leave floors and ceilings blank (faster frames). On: the Sky_idle1 / Floor_idle1 pictures (see FLATS) or ASCII
//   doorSpeed                      fraction of the doorway opened per tick; autoCloseTicks 0 = doors stay open
//   soundRange                     tiles at which a world sound becomes silent (see playAt)
//   alertMemoryTicks               how long an enemy keeps walking to where it last saw/heard you
//   painTicks                      how long an enemy flinches (no moving or attacking) after a pain roll
//   hazard                         damage taken every `interval` ticks while standing in nukage
//   powerTicks                     duration of each timed power-up (see POWERUPS in PICKUPS)
//   terminalUrl / terminalRange    the page a TERMINAL decoration opens (see DECORATIONS `use`) and how close (tiles) you must stand
//   spawnWarningTicks              how long the fire-spike warning shows before a spawner's (Pain Elemental, Arch-vile) enemy appears
//   freezeGraceTicks               after a freeze (PROJECTILES `freeze`) wears off you cannot be frozen again for this long
//   maxEnemies                     spawners (Pain Elemental, Arch-vile) stop spawning while this many enemies are alive
const TUNING = {
  mouseLook: true, mouseSensitivity: 0.0025,
  floorAndCeiling: true,
  doorSpeed: 0.07, doorAutoCloseTicks: 150,
  soundRange: 24,
  alertMemoryTicks: 500,
  painTicks: 6,
  hazard: { damage: 2, interval: 15, label: 'NUKAGE!' },
  powerTicks: { invuln: 750, radsuit: 1500, berserk: 1500 },
  freezeGraceTicks: 50,
  spawnWarningTicks: 14,   // about half a second
  terminalUrl: 'https://bitburner-official.github.io/',   // web version of Bitburner, opened by the terminal in the level
  terminalRange: 1.8,
  berserkMultiplier: 2,
  maxEnemies: 40,
};

// Wall looks. chars runs from near (dense) to far (sparse) and MUST be 12 characters like the default ramp;
// tag colours the wall (null = the plain green of the <pre>); tag is a control char, see CELL_COLORS.
// The first entry is the default for '#'. A MAP_TILES entry picks one with  style: 'brick'.
const WALL_STYLES = {
  stone: { chars: '█#@$Xx+=-:. ', tag: null },
  brick: { chars: '█▓#%Hx+=-:. ', tag: '\x1A' },
  tech: { chars: '█▓▒░Xx+=-:. ', tag: '\x0E' },
};
const WALL_STYLE_IDS = Object.keys(WALL_STYLES);
const STAT_MAX = { health: 100, armor: 100 };   // ammo caps live in AMMO_TYPES[].max

// Coloured text styles for the big centre-screen message
const FLASH_STYLES = {
  '': { color: '#f00', size: '18px' },
  boss: { color: '#f44', size: '20px' },
  secret: { color: '#0ff', size: '18px' },
};

// ─── TERRAIN ────────────────────────────────────────────────────────────────
// TILE ids are what tileKind[] stores (a Uint8Array, so keep them below 256). TILE_IDS maps the string names
// used in MAP_TILES ('wall', 'door' ...) to those ids. A new tile type needs entries in both, a MAP_TILES
// character, and handling in the places listed in "WHERE TO CHANGE WHAT" at the top of the file.
const TILE = { FLOOR: 0, WALL: 1, DOOR: 2, SECRET: 3, EXIT: 4, HAZARD: 5 };
const TILE_IDS = { floor: TILE.FLOOR, wall: TILE.WALL, door: TILE.DOOR, secret: TILE.SECRET, exit: TILE.EXIT, hazard: TILE.HAZARD };

// Map characters that aren't enemies or pickups (those take their character from ENEMIES / PICKUPS).
// Anything not listed anywhere is treated as solid wall and reported at startup.
// Fields: tile (a TILE_IDS name) | style (a WALL_STYLES id, walls only) | player (this tile is the spawn; the LAST one in the file wins) |
// key (door needs this KEYS id; filled in by the derived tables) | reward (a secret tile spawns this pickup,
// offset by dx/dy tiles from the tile centre, so it lands in the room behind the secret wall).
// A reward pickup carries secret: true; nothing reads that flag today, it is informational.
// Unknown characters, including spaces, become walls; non-space ones are reported once at startup.
const MAP_TILES = {
  '#': { tile: 'wall' },
  '%': { tile: 'wall', style: 'brick' }, '&': { tile: 'wall', style: 'tech' },   // wall looks (WALL_STYLES)
  '~': { tile: 'hazard' },                                // nukage: walkable floor that hurts (TUNING.hazard)
  '.': { tile: 'floor' },
  'P': { tile: 'floor', player: true },                // player start
  'E': { tile: 'exit' },
  'D': { tile: 'door' },
  'S': { tile: 'secret', reward: { pickup: 'health', dx: 0, dy: 1 } },  // reward appears 1 tile south
};

// ─── KEYS ───────────────────────────────────────────────────────────────────
// One entry makes a key colour: a keycard pickup (pickupChar), a locked door (doorChar), HUD text and colours.
// tag: colour tag used for ASCII drawing (must be a unique control character, see CELL_COLORS).
// Derived from each entry (see the derived tables): MAP_TILES[doorChar] (a locked door) and
// PICKUPS[id + 'key'] (the keycard, sprite type ID+KEY e.g. REDKEY). The same `tag` colours the locked door,
// the minimap and the keycard glyph, so it must be a control character not used by any other entry in CELL_COLORS.
const KEYS = {
  blue: { name: 'BLUE KEYCARD', hud: 'BLUE', color: '#44f', tag: '\x08', doorChar: 'K', pickupChar: 'b' },
  red: { name: 'RED KEYCARD', hud: 'RED', color: '#f44', tag: '\x18', doorChar: 'R', pickupChar: 'e' },
  yellow: { name: 'YELLOW KEYCARD', hud: 'YELLOW', color: '#fd0', tag: '\x19', doorChar: 'W', pickupChar: 'w' },
};

// ─── WEAPONS ────────────────────────────────────────────────────────────────
//  key           number key that selects it             pickupChar    map character of its pickup (omit = no pickup)
//  pickupAmmo    ammo it comes with                     pickupLetter  letter drawn on the floor (until it has a PNG)
//  fire          'hitscan' | 'projectile' | 'melee'
//  ammoType      key of AMMO_TYPES it uses (null = none) ammoPerShot   ammo used per shot (0 = free)
//  cooldown      ticks between shots (25 ticks = 1 second)    noise    how far (tiles) a shot wakes enemies
//  damage        per pellet / projectile / swing        priority      1-5, who gets auto-selected when ammo runs out (0 = never)
//  hitscan:      pellets, spread (radians)              projectile:   projectile (key of PROJECTILES), spread
//  melee:        range (tiles), arc (radians either side of where you look), hitSound
//  sound/volume  a sound name (see SOUND_FALLBACKS for placeholders)
//  flash/afterglow  ticks of muzzle flash / lingering flash      art    ASCII drawn at the bottom of the screen
// Fields missing from a WEAPONS entry are filled from here by the derived tables. Weapon ids (the keys of WEAPONS)
// are what `owned` and `currentWeapon` store. `key` must be a single character; it is bound to switchWeapon()
// and blocked from the browser. `art` rows are drawn bottom-centre; fire art is shown while shootCooldown is
// still above 60% of the weapon's cooldown. priority 0 = auto-switch never selects it (see autoSwitch()).
const WEAPON_DEFAULTS = {
  fire: 'hitscan', ammoPerShot: 1, cooldown: 10, damage: 1, pellets: 1, spread: 0, volume: 1.0,
  flash: 4, afterglow: 0, priority: 1, pickupAmmo: 0, ammoType: 'bullets', noise: 18,
};

const WEAPONS = {
  pistol: {
    key: '1', name: 'PISTOL', color: '#aaa', priority: 2,
    ammoPerShot: 1, cooldown: 10, damage: 1, sound: 'pistol', afterglow: 6,
    art: { idle: ['  _  ', ' /P\\ '], fire: ['  |  ', ' /P\\ '] },
  },
  shotgun: {
    key: '2', name: 'SHOTGUN', color: '#fa0', priority: 3, pickupChar: '2', pickupLetter: 'S', pickupAmmo: 8, ammoType: 'shells',
    ammoPerShot: 1, cooldown: 22, damage: 1, pellets: 7, spread: 0.08, sound: 'shotgun', afterglow: 18,
    art: { idle: [' === ', '/SGN\\'], fire: [' ||| ', '/SGN\\'] },
  },
  chaingun: {
    key: '3', name: 'CHAINGUN', color: '#0ff', priority: 4, pickupChar: '3', pickupLetter: 'C', pickupAmmo: 20,
    ammoPerShot: 1, cooldown: 4, damage: 1, spread: 0.04, sound: 'pistol', volume: 0.6,
    art: { idle: [' === ', '/CHN\\', '====='], fire: [' ||| ', '/CHN\\', '====='] },
  },
  rocketlauncher: {
    key: '4', name: 'ROCKET LAUNCHER', color: '#f84', priority: 0, pickupChar: '4', pickupLetter: 'R', pickupAmmo: 4, ammoType: 'rockets',
    fire: 'projectile', projectile: 'rocket', ammoPerShot: 1, cooldown: 25, damage: 8,
    sound: 'rocketfire', flash: 3, afterglow: 4,
    art: { idle: ['  O  ', '/RKT\\', '|===|'], fire: [' *O* ', '/RKT\\', '|===|'] },
  },
  plasmarifle: {
    key: '5', name: 'PLASMA RIFLE', color: '#4cf', priority: 5, pickupChar: '5', pickupLetter: 'P', pickupAmmo: 40, ammoType: 'cells',
    fire: 'projectile', projectile: 'plasma', ammoPerShot: 1, cooldown: 3, damage: 1.5,
    sound: 'plasmafire', volume: 0.5, flash: 2,
    art: { idle: ['  :  ', '/PLS\\', '[===]'], fire: [' *:* ', '/PLS\\', '[===]'] },
  },
  bfg9000: {
    key: '6', name: 'BFG 9000', color: '#4f4', priority: 0, pickupChar: '6', pickupLetter: 'B', pickupAmmo: 40, ammoType: 'cells',
    fire: 'projectile', projectile: 'bfgball', ammoPerShot: 20, cooldown: 30, damage: 15,
    sound: 'bfgfire', flash: 6, afterglow: 10,
    art: { idle: ['\\___/', '|BFG|', '|===|'], fire: ['\\***/', '|BFG|', '|===|'] },
  },
  chainsaw: {
    key: '7', name: 'CHAINSAW', color: '#fc4', priority: 1, pickupChar: '7', pickupLetter: 'X', pickupAmmo: 0, ammoType: null, noise: 10,
    fire: 'melee', range: 1.6, arc: 0.6, ammoPerShot: 0, cooldown: 3, damage: 1,
    sound: 'chainsaw', hitSound: 'chainsawhit', volume: 0.4, flash: 0,
    art: { idle: ['  _  ', '<SAW>'], fire: [' _#_ ', '<SAW>'] },
  },
};

// ─── PICKUPS ────────────────────────────────────────────────────────────────
// give: { health | armor: amount, ammo: { <AMMO_TYPES id>: amount }, key: id from KEYS }, power: key of TUNING.powerTicks.   Keycards and weapon pickups are created
// automatically from KEYS and WEAPONS (see the derived tables at the bottom), so only the rest are listed here.
// Ammo found in pickups is scaled by DIFFICULTIES[].ammoPickup.
// glyph: [colour tag, char] drawn on the floor when there is no PNG. PNG art is optional: add e.g. "Ammo_idle1"
// (type = the pickup id upper-cased, "Redkey_idle1", "Shotgun_idle1", "Rocket_Launcher_idle1" ...) to sprites.json
// and it is used automatically.
// The pickup id is also its sprite type when upper-cased (health -> HEALTH, redkey -> REDKEY,
// rocketlauncher -> ROCKETLAUNCHER, which "Rocket_Launcher_idle1" also matches). `sprite` can override that.
// Like Doom, health/armor/ammo pickups are left on the floor while that stat is already full (pickupUseful());
// keycards, weapons and power-ups are always taken.
// Derived entries (keycards, weapons) also get `sound`, and weapons get `weapon: id` so collectPickup()
// adds the weapon to `owned` and switches to it.
const PICKUPS = {
  ammo: { mapChar: 'a', glyph: ['\x17', '='], give: { ammo: { bullets: 20 } }, msg: '+20 BULLETS' },
  shells: { mapChar: 'n', glyph: ['\x17', 'm'], give: { ammo: { shells: 8 } }, msg: '+8 SHELLS' },
  rockets: { mapChar: 'o', glyph: ['\x17', 'o'], give: { ammo: { rockets: 5 } }, msg: '+5 ROCKETS' },
  cells: { mapChar: 'p', glyph: ['\x17', '*'], give: { ammo: { cells: 20 } }, msg: '+20 CELLS' },
  health: { mapChar: 'h', glyph: ['\x15', '+'], give: { health: 25 }, msg: '+25 HEALTH' },
  armor: { mapChar: 'r', glyph: ['\x16', 'A'], give: { armor: 50 }, msg: '+50 ARMOR' },
  // Timed power-ups: `power` names a key of TUNING.powerTicks / the `powers` state.
  invuln: { mapChar: 'v', glyph: ['\x02', 'V'], give: {}, power: 'invuln', msg: 'INVULNERABILITY!', sound: SOUNDS.weaponPickup },
  radsuit: { mapChar: 's', glyph: ['\x02', 'U'], give: {}, power: 'radsuit', msg: 'RADIATION SUIT', sound: SOUNDS.weaponPickup },
  berserk: { mapChar: 'x', glyph: ['\x02', 'B'], give: { health: 100 }, power: 'berserk', msg: 'BERSERK! DOUBLE DAMAGE', sound: SOUNDS.weaponPickup },
};

// ─── DECORATIONS ────────────────────────────────────────────────────────────
// Static cosmetic objects you place in the map: a body on a spike, a skull pile, a candelabra. They never move,
// can't be shot and give nothing; they only look like something (and optionally get in the way).
//   mapChar  character in the map file (must be unique across all tables; the game warns about duplicates)
//   solid    true = you and the enemies can't walk through it (radius = how far its blocking circle reaches, default
//            0.3 tiles). Bullets and enemy shots always pass over decorations.
//   scale    sprite size, like an enemy's render.scale (tall things want a bigger number so they stay full size at range)
//   hang     true = the picture hangs from the ceiling (its top edge sits at the top of the wall). Use it with
//            solid:false so the player can walk underneath.
//   float    true = the picture floats at eye level instead (for a hovering thing). Without hang or float the picture's
//            bottom edge sits on the floor, so it stands on the ground whatever its size.
//   anim     milliseconds per frame. Leave it out for a single still picture (frame 1 only). With it, every
//            "<Type>_idle<N>" frame loops, and each placed copy starts at a different point so a row of torches
//            doesn't flicker in step.
//   use      what pressing F does when you stand close, facing it (within TUNING.terminalRange). Only 'terminal' exists:
//            it opens TUNING.terminalUrl (the web version of Bitburner) in an overlay and pauses the game. A message
//            tells you to press F when you are in range.
//   glyph / blob   ASCII stand-in used until art exists: glyph [tag, char] is one character on the floor, blob
//            { tag, chars, size } is a small ASCII shape in the air (same format as PROJECTILES blob)
// Art: "<Type>_idle1" in sprites.json (plus idle2, idle3 ... if it is animated, any number of frames), where Type is
// the key below with underscores removed and upper-cased, e.g. IMPALEDBODY <- "Impaled_Body_idle1". To add one,
// copy an entry.
const DECORATIONS = {
  IMPALEDBODY: { mapChar: 't', solid: true, scale: 3, blob: { tag: '\x18', chars: '|#:.', size: 0.35 } },
  SKULLPILE: { mapChar: 'j', solid: true, scale: 1.5, blob: { tag: '\x14', chars: '@o.', size: 0.45 } },
  CANDELABRA: { mapChar: 'u', solid: true, scale: 2, blob: { tag: '\x19', chars: 'Y!i.', size: 0.25 } },
  // Animated (flames): frames loop at `anim` ms each
  BURNINGBARREL: { mapChar: 'k', solid: true, scale: 1, anim: 120, blob: { tag: '\x19', chars: 'W^*.', size: 0.35 } },   // Burning_Barrel_idle1..3
  REDTORCH: { mapChar: 'T', solid: true, radius: 0.2, scale: 2.5, anim: 120, blob: { tag: '\x18', chars: 'Y!i.', size: 0.25 } },   // Red_Torch_idle1..4
  // Still pictures
  TECHLAMP: { mapChar: 'U', solid: true, radius: 0.2, scale: 2.5, blob: { tag: '\x16', chars: 'O|:.', size: 0.25 } },   // Tech_Lamp_idle1
  STAKEDCORPSE: { mapChar: 'X', solid: true, radius: 0.2, scale: 2.5, blob: { tag: '\x0A', chars: '|#:.', size: 0.35 } },   // Staked_Corpse_idle1
  GOREPOLE: { mapChar: 'G', solid: true, radius: 0.2, scale: 2.5, blob: { tag: '\x18', chars: '@#:.', size: 0.35 } },   // Gore_Pole_idle1
  // Usable: face it and press F (see `use` above). Animated art: Terminal_idle1..3 (ASCII computer until then)
  TERMINAL: { mapChar: '1', solid: true, radius: 0.3, scale: 1.2, anim: 200, use: 'terminal', blob: { tag: '\x1D', chars: '#[=:.', size: 0.3 } },
  // Hanging from the ceiling (walk under them)
  HANGINGBODY1: { mapChar: 'H', solid: false, hang: true, scale: 2, blob: { tag: '\x18', chars: '|#:.', size: 0.3 } },   // Hanging_Body_1_idle1
  HANGINGBODY2: { mapChar: 'J', solid: false, hang: true, scale: 2, blob: { tag: '\x18', chars: '|#:.', size: 0.3 } },   // Hanging_Body_2_idle1
  HANGINGBODY3: { mapChar: 'N', solid: false, hang: true, scale: 2, blob: { tag: '\x18', chars: '|#:.', size: 0.3 } },   // Hanging_Body_3_idle1
};

// ─── PROJECTILES ────────────────────────────────────────────────────────────
// speed: tiles per tick. damage: default damage (an attack or weapon can override it).
// sprite: sprite type to draw: art "<Type>_projectile" in flight and "<Type>_projectile_impact" where an ENEMY shot
//         lands (one image each). Default / false = ASCII only, drawn from `blob` (there is no generic projectile art).
// hitSound: sound played where an ENEMY shot lands.   scale: size of the flying picture (default 1).
//         "<Type>_projectile_impact1", "..2" ... (several frames) play once, 2 ticks each; one image shows briefly.
// freeze: ticks (25 per second) the player cannot WALK after being hit by this ENEMY shot (turning, shooting and using
//         doors still work). Shows as FROZEN on the HUD. Hits while frozen do not extend it, and for
//         TUNING.freezeGraceTicks after thawing you cannot be frozen again (no endless stun-lock). Invulnerable = immune.
// blob: { tag, chars, size }  ASCII drawing used when there is no PNG: size in tiles, chars go from the centre outward.
// Player weapons only:
//   splash     { radius, damage, hurtsPlayer }  explosion damage to everything in line of sight, fading with distance
//   explosion  { ttl, tag, chars, size }        the ASCII flash left behind (ttl in ticks)
//   explosionSound                              sound name played when it goes off
// One table serves enemy shots AND player weapon shots (the `owner` field on a live projectile tells them apart).
// splash / explosion / explosionSound are only honoured for owner 'player' (explode() is never called for
// enemy shots, which simply hurt the player on touch). Speeds above 0.15 are sub-stepped in updateGame().
// Small ASCII puff used for impacts that have no art: bullets hitting an enemy, and enemy shots with no impact sprite.
const HIT_BLOB = { tag: '\x15', chars: '*+.', size: 0.5 };
const PROJECTILES = {
  fireball: { speed: 0.15, damage: 4, sprite: 'IMP' },
  pellet: { speed: 0.16, damage: 2, blob: { tag: '\x17', chars: '*.', size: 0.15 } },
  cacofireball: { speed: 0.12, damage: 6, sprite: 'CACODEMON' },
  skull: { speed: 0.18, damage: 1, sprite: 'LOSTSOUL' },
  // Projectiles of the newer enemies: `sprite` names the art type to use once "<Type>_projectile" exists in
  // sprites.json; until then the ASCII `blob` is drawn (a missing sprite is not an error when a blob is given).
  baronball: { speed: 0.14, damage: 8, sprite: 'BARON', blob: { tag: '\x1D', chars: '@o*', size: 0.5 } },
  // The Cryobus reuses the Cacodemon's fireball art (Cacodemon_projectile / _impact), so its `sprite` is CACODEMON.
  cryobusball: { speed: 0.11, damage: 5, freeze: 75, sprite: 'CACODEMON', blob: { tag: '\x1B', chars: '@o*', size: 0.55 } },   // 75 ticks = 3 s frozen
  cyberdemonrocket: { speed: 0.14, damage: 18, sprite: 'CYBERDEMON' },
  // Zombie tanks. The missile has art (Zombie_Missile_Tank_projectile + _projectile_impact1..3); the plasma ball is ASCII.
  tankmissile: { speed: 0.10, damage: 10, scale: 2, sprite: 'ZOMBIEMISSILETANK', hitSound: 'zombietankmissilehit', blob: { tag: '\x1B', chars: '@o*', size: 0.4 } },
  tankplasma: { speed: 0.20, damage: 4, sprite: false, blob: { tag: '\x1C', chars: '*+', size: 0.3 } },

  rocket: {
    speed: 0.30, damage: 8, sprite: false, blob: { tag: '\x1E', chars: '@o', size: 0.35 },
    splash: { radius: 2.5, damage: 8, hurtsPlayer: true },
    explosion: { ttl: 8, tag: '\x1B', chars: '@*+.', size: 2.5 }, explosionSound: 'rocketexplode',
  },
  plasma: {
    speed: 0.35, damage: 1.5, sprite: false, blob: { tag: '\x1C', chars: '*', size: 0.25 },
    explosion: { ttl: 5, tag: '\x1C', chars: '*+.', size: 0.8 }, explosionSound: 'plasmahit',
  },
  bfgball: {
    speed: 0.30, damage: 15, sprite: false, blob: { tag: '\x1D', chars: '@*+', size: 1.0 },
    splash: { radius: 5, damage: 12, hurtsPlayer: false },
    explosion: { ttl: 14, tag: '\x1D', chars: '@*+.', size: 6 }, explosionSound: 'bfgexplode',
  },
};

// ─── ENEMIES ────────────────────────────────────────────────────────────────
//  hp         hits to kill (a pistol bullet does 1)             mapChar   character in the map file
//  speed      tiles/tick while chasing; 0 = holds position; or a function (enemy) => number
//  sight      starts chasing within this many tiles (needs line of sight)
//  roam       never strays further than this from where it spawned
//  hitbox     half-width of the area bullets hit; radius = how close it can get to walls
//  points / killMsg / boss    score, message on death, and whether messages use the big red style
//  anim       { walk, attack }  milliseconds per animation frame
//  render     { scale: sprite size, float: true = flies (drawn at eye level; everything else stands on the floor),
//               fall: how far a FLYING corpse sinks, corpse: false = vanishes after dying }
//  sounds     { hurt, death }
//  attacks    list of attacks, each rolls independently every tick:
//               { kind: 'ranged' | 'melee', range: [min, max] tiles, chance: per tick, sound, volume,
//                 animate: false to skip the attack animation }
//               ranged: projectile (key of PROJECTILES), count, spread, damage (overrides the projectile's),
//                       muzzles: [sideways offsets in tiles] fires ONE shot from each offset (negative = the enemy's left
//                       as seen from the player, positive = right) instead of `count` shots from its centre; the Cryobus
//                       uses [-0.45, 0.45] for one fireball out of each arm. `spread` still jitters each shot's aim.
//               spawn:  summons enemies near itself instead of hurting you. spawn: 'LOSTSOUL' | ['IMP','DEMON'] | 'any'
//                       (any = every enemy that is not spawnable:false, picked by spawnWeight), count per use (default 1),
//                       maxAlive = how many of ITS spawned enemies may be alive at once (default 4). Also limited by
//                       TUNING.maxEnemies overall. The enemy appears TUNING.spawnWarningTicks after the attack, at a spot marked
//                       by the Spawn_Warning art (see trySpawn). Spawned enemies are awake and hunting, and do not count as kills
//                       or give points (kills are out of the enemies that were placed in the map).
//               melee:  damage, label, bypassArmor, ignoreCritical
//  onDeath    { explode: { radius, damage, label, sound, hurtsEnemies, falloff, blob } }  an explosion when it dies.
//             By default it hurts only the player, with the full damage anywhere inside radius (Lost Soul).
//             hurtsEnemies: true also damages every living enemy (and barrel) in radius, so explosions chain.
//             falloff: true = damage fades linearly to 0 at the edge and needs line of sight (walls shelter you).
//             blob: ASCII flash shown when the enemy has no "<Type>_death" art.
//             art: sprite type of an explosion animation ("<Art>_idle1..N" played once at the enemy, 2 ticks a frame), scale: its size.
//  onDeath    also takes (all optional, any combination):
//             smoke: ['TANKSMOKE1', ...]  a few smoke puffs (one random type each, "<Type>_idle1..N" played once) over the wreck
//             debris: 'TANKGUN'           two pieces ("<Type>_idle1..N" tumbling) thrown out to the sides, then lying on the floor
//             spawn: { types: ['ZOMBIE','ZOMBIESERGEANT'], at: 12 }  something climbs out of the wreck: one random type, awake and
//                    hunting, `at` ticks into the death animation. Like summoned enemies it gives no kill or points.
//  prop       true = scenery you can shoot (the exploding barrel): never moves or attacks, gives no kills or points,
//             and is not part of the end-screen kill total. Its art is "<Type>_idle1..." (any number of frames, looped)
//             and "<Type>_death1..." (the explosion, 2 ticks per frame, then it disappears).
//  blob       { tag, chars, size }  ASCII body drawn while the enemy has no PNG walk sprites yet (same format as
//             PROJECTILES blob). Once "<Type>_walk1" exists in sprites.json the art takes over by itself.
//  spawnable  false = an 'any' spawner never picks this type (Arch-vile so it can't summon more Arch-viles)
//  spawnWeight  relative chance of being picked by an 'any' spawner (default 1; bosses are rare)
//  painChance chance (0-1) that a hit makes it flinch for TUNING.painTicks (no moving or attacking)
//  stopDistance  while chasing a player it can see, it stops this many tiles away instead of walking into you
//                (melee enemies set it just inside their bite range; 0 = keep pushing in)
//  wakeOnDoor    true = when the player opens a door into the room this enemy is in, it charges at the player
//                from anywhere in that room (see wakeBeyondDoor; only that room, not the whole level)
//  relentless    true = while it is hunting (memory not expired) and can't see you, it finds a route to where you are
//                NOW, not just where you were last seen. Without it, it finds a route to the remembered spot.
// Merge rules (derived tables): top-level fields are overridden by the entry; `anim` and `render` are merged one
// level deep (so  anim: { walk: 300 }  keeps the default attack time); `sounds` and `attacks` are NOT merged
// with defaults (an entry that omits them gets none). At runtime each live enemy keeps `def` pointing at its
// ENEMIES entry, so edits (and checkGameData's attack filtering) are shared by all enemies of that type.
// `sight` only gates SEEING the player; enemies also chase the last place they saw or heard you (see updateEnemy).
// Attacks are gated by their own range, chance and line of sight.
// `hitbox` (what bullets hit) and `radius` (clearance from walls when moving) are different things.
const ENEMY_DEFAULTS = {
  hp: 1, hitbox: 0.6, radius: 0.35, speed: 0.011, sight: 12, roam: 8, painChance: 0.25, stopDistance: 0, wakeOnDoor: false, relentless: false,
  blob: null, spawnable: true, spawnWeight: 1, prop: false,
  points: 50, killMsg: '- ENEMY DOWN -', boss: false,
  anim: { walk: 400, attack: 150 },
  render: { scale: 1, fall: 0.8, corpse: true, float: false },
  sounds: {}, attacks: [],
};

const ENEMIES = {
  ZOMBIE: {
    mapChar: 'z', hp: 1, points: 50, killMsg: '- ZOMBIE DOWN -',
    sounds: { hurt: 'zombieinjured', death: 'zombiedeath' },
    attacks: [
      { kind: 'ranged', projectile: 'pellet', count: 5, spread: 0.2, range: [1.5, 12], chance: 0.015, sound: 'shotgun', volume: 0.6 },
      { kind: 'melee', damage: 4, range: [0, 0.8], chance: 0.018 },
    ],
  },
  // Shotgun zombie: tougher than the plain Zombie and fires a wider, heavier blast of pellets. Art: Zombie_Sergeant_*
  ZOMBIESERGEANT: {
    mapChar: 'Z', hp: 2, points: 90, killMsg: '- ZOMBIE SERGEANT DOWN -',
    sounds: { hurt: 'zombiesergeantinjured', death: 'zombiesergeantdeath' },
    attacks: [
      { kind: 'ranged', projectile: 'pellet', count: 7, spread: 0.3, range: [1.5, 12], chance: 0.02, sound: 'zombiesergeantattack', volume: 0.7 },
      { kind: 'melee', damage: 5, range: [0, 0.8], chance: 0.018 },
    ],
  },
  IMP: {
    mapChar: 'i', hp: 2, points: 100, killMsg: '* IMP KILLED *',
    anim: { walk: 300 },
    sounds: { hurt: 'impinjured', death: 'impdeath' },
    attacks: [
      { kind: 'ranged', projectile: 'fireball', range: [1.5, 10], chance: 0.02, sound: 'impattack', volume: 0.7 },
      { kind: 'melee', damage: 6, range: [0, 0.8], chance: 0.018 },
    ],
  },
  DEMON: {
    mapChar: 'd', hp: 4, points: 200, killMsg: '** DEMON SLAIN **',
    // Pure melee brawler: charges the moment it sees you (about 1.1 tiles/s, several times faster than a zombie),
    // hunts you across most of a level (large roam/sight), rarely flinches, closes to biting distance and
    // then bites about twice a second (chance 0.08 per tick, 25 ticks/s). Has no ranged attack on purpose.
    // wakeOnDoor: opening a door into its room sets it off immediately, even from the far side of a big room.
    speed: 0.045, sight: 20, roam: 40, painChance: 0.1, stopDistance: 0.75, wakeOnDoor: true, relentless: true,
    anim: { walk: 200 },
    sounds: { hurt: 'demoninjured', death: 'demondeath' },
    attacks: [
      { kind: 'melee', damage: 8, range: [0, 1.1], chance: 0.08, sound: 'demonattack', volume: 0.8 },
    ],
  },
  CACODEMON: {
    mapChar: 'c', hp: 6, points: 300, killMsg: '** CACODEMON DEAD **',
    speed: 0,            // hovers in place and shoots; give it e.g. 0.008 to make it chase
    sight: 16, hitbox: 1.0,
    render: { scale: 8, fall: 2.0, float: true },
    sounds: { hurt: 'cacodemoninjured', death: 'cacodemondeath' },
    attacks: [
      { kind: 'ranged', projectile: 'cacofireball', range: [3, 12], chance: 0.08, sound: 'cacodemonattack', volume: 0.8 },
      { kind: 'melee', damage: 8, range: [0, 0.8], chance: 0.025, sound: 'cacodemonattack', volume: 0.8 },
    ],
  },
  LOSTSOUL: {
    mapChar: 'l', hp: 1, points: 75, killMsg: '* LOST SOUL DESTROYED *',
    anim: { walk: 200 },
    render: { corpse: false, float: true }, painChance: 0,
    sounds: { hurt: 'lostsoulinjured', death: 'lostsouldeath' },
    attacks: [
      { kind: 'ranged', projectile: 'skull', range: [0, 8], chance: 0.035, sound: 'lostsoulattack', volume: 0.7 },
    ],
    onDeath: { explode: { radius: 2.5, damage: 10, label: 'LOST SOUL EXPLOSION!', sound: 'lostsouldeath' } },
  },
  CYBERDEMON: {
    mapChar: 'Y', hp: 30, points: 5000, killMsg: '★★ CYBERDEMON SLAIN ★★', boss: true,
    speed: e => 0.009 + (1 - e.hp / e.maxHp) * 0.008,   // speeds up as it gets hurt
    sight: 25, roam: 18, hitbox: 1.2, painChance: 0.05,
    render: { scale: 12, fall: 3.0 },
    sounds: { hurt: 'cyberdemoninjured', death: 'cyberdemondeath' },
    attacks: [
      { kind: 'ranged', projectile: 'cyberdemonrocket', range: [3, 20], chance: 0.03, sound: 'cyberdemonattack', volume: 1.0 },
      { kind: 'melee', damage: 20, range: [0, 1.5], chance: 0.04, sound: 'cyberdemonattack', volume: 0.8, label: 'CYBERDEMON HIT!', ignoreCritical: true },
    ],
    spawnWeight: 0.15,
  },
  // ── Newer enemies. None has PNG art yet: each has an ASCII `blob` body until "<Type>_walk1" etc. are added to
  // sprites.json (see sprites_reference.md). render.scale values are guesses; tune them once the art exists.
  // Sounds come from audio.json: "<type>injured", "<type>death", "<type>attack" (SOUND_FALLBACKS can stand in for any that are missing).
  BARON: {
    mapChar: 'B', hp: 12, points: 600, killMsg: '** BARON OF HELL SLAIN **',
    speed: 0.014, sight: 18, roam: 20, hitbox: 0.9, painChance: 0.08,
    anim: { walk: 300 }, render: { scale: 3, fall: 1.5 },
    blob: { tag: '\x1D', chars: '@O*.', size: 0.9 },
    sounds: { hurt: 'baroninjured', death: 'barondeath' },
    attacks: [
      { kind: 'ranged', projectile: 'baronball', range: [1.5, 14], chance: 0.025, sound: 'baronattack', volume: 0.8 },
      { kind: 'melee', damage: 10, range: [0, 1.0], chance: 0.03, sound: 'baronattack', volume: 0.8 },
    ],
  },
  SPIDERMASTERMIND: {
    mapChar: 'M', hp: 50, points: 8000, killMsg: '★★ SPIDER MASTERMIND SLAIN ★★', boss: true,
    speed: 0.010, sight: 30, roam: 30, hitbox: 1.4, radius: 0.5, painChance: 0.02,
    render: { scale: 10, fall: 3.0 }, spawnWeight: 0.15,
    blob: { tag: '\x16', chars: '@#*:', size: 1.6 },
    sounds: { hurt: 'spidermastermindinjured', death: 'spidermasterminddeath' },
    attacks: [
      // rapid bursts of bullets: several pellets, fired often
      { kind: 'ranged', projectile: 'pellet', count: 4, spread: 0.3, damage: 2, range: [2, 25], chance: 0.08, sound: 'spidermastermindattack', volume: 1.0 },
    ],
  },
  // ── The zombie tanks (the Zombie Tank Pack mod; front-facing art only). The machine-gun tank replaced the Chaingunner and
  // keeps its map character `g`. Each one blows up when it dies (hurting you if you stand close), throws off its guns, smokes,
  // and a Zombie or Zombie Sergeant climbs out. Art: Zombie_Tank_*, Zombie_Missile_Tank_*, Zombie_Plasma_Tank_* (walk 1-3,
  // attack 1-2, death 1-9), plus the shared Tank_Explosion, Tank_Smoke_1-4 and Tank_Gun / Tank_Missile_Gun / Tank_Plasma_Gun art.
  // scale / fall are guesses (fall 0.5 drops the low wreck onto the floor): tune them in play.
  ZOMBIETANK: {
    mapChar: 'g', hp: 12, points: 350, killMsg: '** ZOMBIE TANK DESTROYED **',
    speed: 0.010, sight: 16, roam: 12, hitbox: 0.85, radius: 0.45, painChance: 0.08, spawnWeight: 0.5,
    anim: { walk: 220 }, render: { scale: 7, fall: 0.5 },
    blob: { tag: '\x1E', chars: '#*:.', size: 0.6 },
    sounds: { hurt: 'zombietankinjured', death: 'zombietankdeath' },
    attacks: [
      // a burst from both guns and the middle
      { kind: 'ranged', projectile: 'pellet', muzzles: [-0.4, 0, 0.4], spread: 0.2, damage: 2, range: [2, 14], chance: 0.05, sound: 'zombietankattack', volume: 0.8 },
    ],
    onDeath: {
      explode: { radius: 2.2, damage: 8, label: 'TANK EXPLOSION!', sound: 'zombietankexplode', falloff: true, art: 'TANKEXPLOSION', scale: 3, blob: { tag: '\x1B', chars: '@*+.', size: 1.5, ttl: 8 } },
      smoke: ['TANKSMOKE1', 'TANKSMOKE2', 'TANKSMOKE3', 'TANKSMOKE4'], debris: 'TANKGUN',
      spawn: { types: ['ZOMBIE', 'ZOMBIESERGEANT'], at: 12 },
    },
  },
  ZOMBIEMISSILETANK: {
    mapChar: '8', hp: 14, points: 500, killMsg: '** MISSILE TANK DESTROYED **',
    speed: 0.009, sight: 18, roam: 12, hitbox: 0.85, radius: 0.45, painChance: 0.06, spawnWeight: 0.4,
    anim: { walk: 220 }, render: { scale: 7, fall: 0.5 },
    blob: { tag: '\x18', chars: '#*:.', size: 0.6 },
    sounds: { hurt: 'zombietankinjured', death: 'zombietankdeath' },
    attacks: [
      // a missile out of each side
      { kind: 'ranged', projectile: 'tankmissile', muzzles: [-0.5, 0.5], spread: 0.04, range: [3, 16], chance: 0.02, sound: 'zombietankmissile', volume: 0.9 },
    ],
    onDeath: {
      explode: { radius: 2.2, damage: 8, label: 'TANK EXPLOSION!', sound: 'zombietankexplode', falloff: true, art: 'TANKEXPLOSION', scale: 3, blob: { tag: '\x1B', chars: '@*+.', size: 1.5, ttl: 8 } },
      smoke: ['TANKSMOKE1', 'TANKSMOKE2', 'TANKSMOKE3', 'TANKSMOKE4'], debris: 'TANKMISSILEGUN',
      spawn: { types: ['ZOMBIE', 'ZOMBIESERGEANT'], at: 12 },
    },
  },
  ZOMBIEPLASMATANK: {
    mapChar: '9', hp: 12, points: 450, killMsg: '** PLASMA TANK DESTROYED **',
    speed: 0.010, sight: 16, roam: 12, hitbox: 0.85, radius: 0.45, painChance: 0.08, spawnWeight: 0.4,
    anim: { walk: 220 }, render: { scale: 7, fall: 0.5 },
    blob: { tag: '\x1C', chars: '#*:.', size: 0.6 },
    sounds: { hurt: 'zombietankinjured', death: 'zombietankdeath' },
    attacks: [
      // rapid plasma balls, one out of each side
      { kind: 'ranged', projectile: 'tankplasma', muzzles: [-0.45, 0.45], spread: 0.05, range: [2, 15], chance: 0.06, sound: 'zombieplasmatankattack', volume: 0.7 },
    ],
    onDeath: {
      explode: { radius: 2.2, damage: 8, label: 'TANK EXPLOSION!', sound: 'zombietankexplode', falloff: true, art: 'TANKEXPLOSION', scale: 3, blob: { tag: '\x1B', chars: '@*+.', size: 1.5, ttl: 8 } },
      smoke: ['TANKSMOKE1', 'TANKSMOKE2', 'TANKSMOKE3', 'TANKSMOKE4'], debris: 'TANKPLASMAGUN',
      spawn: { types: ['ZOMBIE', 'ZOMBIESERGEANT'], at: 12 },
    },
  },
  CRYOBUS: {
    mapChar: 'm', hp: 16, points: 800, killMsg: '** CRYOBUS DESTROYED **',
    speed: 0.007, sight: 16, roam: 14, hitbox: 1.0, painChance: 0.05,
    // Art: Cryocubus mod sprites (front-facing frames; walk 1-6, attack 1-3, death 1-6). scale/fall are guesses: tune in play.
    anim: { walk: 250 },
    render: { scale: 9, fall: 2.0 },
    blob: { tag: '\x1B', chars: '@O*.', size: 1.1 },
    sounds: { hurt: 'cryobusinjured', death: 'cryobusdeath' },
    attacks: [
      // two fireballs, one out of each arm
      { kind: 'ranged', projectile: 'cryobusball', muzzles: [-0.45, 0.45], spread: 0.06, range: [2, 14], chance: 0.03, sound: 'cryobusattack', volume: 0.9 },
    ],
  },
  // Scenery: shoot it and it explodes, hurting everything within 3 tiles (more damage the closer, and only with line of
  // sight), including other barrels, which chain. Enemies killed by it count as your kills. It blocks movement.
  // Art: Barrel_idle1.. (looped) and Barrel_death1.. (explosion frames); an ASCII barrel and flash are used until then.
  BARREL: {
    mapChar: '0', hp: 3, prop: true, points: 0, killMsg: '',
    speed: 0, sight: 0, roam: 0, hitbox: 0.4, radius: 0.35, painChance: 0,
    anim: { walk: 300 }, render: { scale: 1, fall: 0, corpse: false },
    blob: { tag: '\x15', chars: 'O0o.', size: 0.4 },
    sounds: {},
    attacks: [],
    onDeath: { explode: { radius: 3, damage: 40, label: 'BARREL EXPLOSION!', sound: 'barrelexplode', hurtsEnemies: true, falloff: true,
      blob: { tag: '\x1B', chars: '@*+.', size: 2.5, ttl: 8 } } },
    spawnable: false,
  },
  // Spawners: no attack of their own, they summon enemies near themselves while they can see you.
  PAINELEMENTAL: {
    mapChar: 'L', hp: 6, points: 400, killMsg: '** PAIN ELEMENTAL DESTROYED **',
    speed: 0.008, sight: 16, roam: 12, hitbox: 1.0, painChance: 0.2,
    render: { scale: 6, fall: 2.0, float: true }, spawnWeight: 0.5,
    blob: { tag: '\x1A', chars: '@O*.', size: 1.0 },
    sounds: { hurt: 'painelementalinjured', death: 'painelementaldeath' },
    attacks: [
      { kind: 'spawn', spawn: 'LOSTSOUL', count: 2, maxAlive: 8, range: [0, 16], chance: 0.03, sound: 'painelementalattack', volume: 0.9 },
    ],
  },
  ARCHVILE: {
    mapChar: 'V', hp: 14, points: 1000, killMsg: '** ARCH-VILE BANISHED **',
    // Fast and keeps its distance (stopDistance) while it summons a random enemy from anywhere in the game.
    // spawnable: false so it can never summon another Arch-vile.
    speed: 0.03, sight: 20, roam: 25, hitbox: 0.7, painChance: 0.1, stopDistance: 6, relentless: true, spawnable: false,
    render: { scale: 2, fall: 1.0 },
    blob: { tag: '\x19', chars: '@O*.', size: 0.6 },
    sounds: { hurt: 'archvileinjured', death: 'archviledeath' },
    attacks: [
      { kind: 'spawn', spawn: 'any', count: 1, maxAlive: 4, range: [0, 18], chance: 0.02, sound: 'archvileattack', volume: 0.9 },
    ],
  },
};

// ─── derived tables (nothing to edit below this line) ───────────────────────
// ORDER MATTERS: KEYS first (adds MAP_TILES doors and keycard PICKUPS), then WEAPONS (merges defaults, adds weapon
// PICKUPS, then builds WEAPON_KEYS), then ENEMIES, and finally CHAR_INFO, which reads MAP_TILES, ENEMIES and
// PICKUPS and so must see all of the additions above.
for (const [id, k] of Object.entries(KEYS)) {
  MAP_TILES[k.doorChar] = { tile: 'door', key: id };
  PICKUPS[id + 'key'] = { mapChar: k.pickupChar, glyph: [k.tag, 'K'], give: { key: id }, msg: `${k.name} ACQUIRED!` };
}

for (const [id, w] of Object.entries(WEAPONS)) {
  WEAPONS[id] = { ...WEAPON_DEFAULTS, id, ...w };
  if (w.pickupChar) {
    const ammoType = WEAPONS[id].ammoType;
    PICKUPS[id] = {
      mapChar: w.pickupChar, glyph: ['\x1E', w.pickupLetter ?? w.name[0]],
      give: ammoType && w.pickupAmmo ? { ammo: { [ammoType]: w.pickupAmmo } } : {},
      weapon: id, msg: `YOU GOT THE ${w.name}!`, sound: SOUNDS.weaponPickup,
    };
  }
}
const WEAPON_KEYS = Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [w.key, id]));

for (const [id, d] of Object.entries(ENEMIES)) {
  ENEMIES[id] = {
    id, ...ENEMY_DEFAULTS, ...d,
    anim: { ...ENEMY_DEFAULTS.anim, ...d.anim },
    render: { ...ENEMY_DEFAULTS.render, ...d.render },
    sounds: { ...d.sounds },
    attacks: d.attacks ?? [],
  };
}

// Map character -> what it means. Enemy, pickup and decoration characters come from their own tables.
// CHAR_INFO[char] = what that map character means: { tile, player?, key?, reward?, enemy?, pickup?, decor? }.
// First registration wins, so a character used twice keeps its MAP_TILES meaning and the duplicate is listed in
// CHAR_CONFLICTS (printed as a warning by main). Map characters are case sensitive: 'E' is the exit, 'e' a red keycard.
const { info: CHAR_INFO, conflicts: CHAR_CONFLICTS } = (() => {
  const info = {}, conflicts = [];
  const add = (ch, def, what) => { if (info[ch]) conflicts.push(`'${ch}' (${what})`); else info[ch] = def; };
  for (const [ch, def] of Object.entries(MAP_TILES)) add(ch, def, 'MAP_TILES');
  for (const [id, e] of Object.entries(ENEMIES)) add(e.mapChar, { tile: 'floor', enemy: id }, id);
  for (const [id, p] of Object.entries(PICKUPS)) add(p.mapChar, { tile: 'floor', pickup: id }, id);
  for (const [id, d] of Object.entries(DECORATIONS)) add(d.mapChar, { tile: 'floor', decor: id }, id);
  return { info, conflicts };
})();

// main() runs the whole game: setup, title screen, asset loading, then the game loop (see EXECUTION ORDER at the top).
// Everything below is a closure over main's locals. Sections are marked with ─── headers in this order:
// AUTO UPDATE, MAP (parseMap), SPRITES, MAP QUERIES, CONSTANTS, GAME STATE, DOM SETUP, INPUT, HUD, PICKUPS, DAMAGE, AUDIO,
// RAYCASTING, USE, WEAPONS, SHOOT, RENDER, TITLE/END SCREENS, TITLE LOOP, MAIN GAME LOOP (movement, enemy AI,
// updateGame, doors, LEVEL LIFECYCLE, frame loop).
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');

  // Compare two version strings (e.g., "12" vs "13")
  // Returns: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
  function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  // ─── LAUNCH FLAGS ──────────────────────────────────────────────────────────
  // Cheats and the auto-updater are switched with flags when you start the script, e.g.
  //   run doom.js --godmode --noupdate
  //   --noupdate      skip the auto-update check (use this while editing the script, or you may lose your edits)
  //   --godmode       you never take damage
  //   --infiniteammo  weapons never run out of ammo
  //   --allweapons    start with every weapon and full ammo
  //   --noautoswitch  don't switch weapon automatically when the current one runs dry
  //   --help          print this list and quit
  // Flags are read by ns.flags (the only way settings enter the game). A flag that isn't in FLAG_SCHEMA is reported and
  // ignored. If ns.flags is missing (some web-page converters) every flag is simply off. The auto-updater restarts the
  // script with the same arguments, so flags survive an update.
  const FLAG_SCHEMA = [['help', false], ['noupdate', false], ['godmode', false], ['infiniteammo', false], ['allweapons', false], ['noautoswitch', false]];
  const flags = typeof ns.flags === 'function' ? ns.flags(FLAG_SCHEMA) : Object.fromEntries(FLAG_SCHEMA);
  if (flags.help) {
    ns.tprint('doom.js flags:  --noupdate (skip auto-update)  --godmode (no damage)  --infiniteammo  --allweapons (every weapon, full ammo)  --noautoswitch (no automatic weapon switch)  --help');
    return;
  }
  const unknownFlags = Object.keys(flags).filter(k => k !== '_' && !FLAG_SCHEMA.some(f => f[0] === k)).map(k => `--${k}`).concat((flags._ || []).map(String));
  if (unknownFlags.length) ns.tprint(`doom.js: ignoring unknown arguments: ${unknownFlags.join(' ')}  (run doom.js --help for the list)`);
  const INFINITE_HEALTH = !!flags.godmode;
  const INFINITE_AMMO = !!flags.infiniteammo;
  const ALL_WEAPONS = !!flags.allweapons;
  const AUTO_SWITCH_EMPTY = !flags.noautoswitch; // Switch to a weapon that has ammo when the current one runs dry
  // NOTE: auto-update downloads and RUNS code from the repo below. Turn it off with --noupdate if you don't
  // trust that repo, and always while testing local edits.
  const AUTO_UPDATE = !flags.noupdate;

  // ─── AUTO UPDATE ─────────────────────────────────────────────────────────
  // HOW AUTO-UPDATE WORKS: fetch doom.js from the repo, read ITS version with a regex on the first
  // VERSION declaration it finds, and if that is higher than this file's, download map.txt / audio.json /
  // sprites.json too, validate the two JSON files, write the assets first and doom.js LAST (so a failed download
  // cannot leave a new script with old assets), then ns.exec('doom.js', 'home', 1, ...ns.args) and return from this run.
  // Consequences: the script must be named doom.js on 'home'; the repo's data files REPLACE the local ones; a local
  // edit survives only if run with --noupdate (AUTO_UPDATE false) or this VERSION is not lower than the repo's. Bump VERSION on every
  // release or nobody receives it. Any failure (network, bad JSON, timeout) is non-fatal: the current version runs, and the reason is printed to the terminal.
  // Timeouts: 8 s for the version check (doom.js), 180 s for each data file (audio.json is about 24 MB; a short limit made updates fail silently).
  const VERSION = '47';
  const REPO_USER = 'Darxide777';
  const REPO_NAME = 'Bitburner-Doom';
  const BRANCH = 'main';
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/${BRANCH}`;

  if (AUTO_UPDATE) {
    try {
      const fetchText = async (file, timeoutMs = 180000) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetch(`${RAW_BASE}/${file}`, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
          return await res.text();
        } finally {
          clearTimeout(timer);
        }
      };

      const remote = await fetchText('doom.js', 8000);
      const match = remote.match(/const VERSION = '([^']+)'/);
      const remoteVersion = match ? match[1] : null;

      if (remoteVersion && compareVersions(VERSION, remoteVersion) < 0) {
        ns.tprint(`UPDATE: New version ${remoteVersion} available. Downloading (the sound file is large, this can take a while)...`);

        // Download and validate everything first, so a failed download can't leave a half-updated install.
        const assets = {};
        for (const f of Object.values(ASSETS)) assets[f] = await fetchText(f);
        // Extra level maps named in the repo's LEVELS. Optional: a missing one is skipped, not fatal.
        for (const m of remote.matchAll(/\bmap: '([^']+)'/g)) {
          if (m[1] in assets || !/\.txt$/.test(m[1])) continue;
          try { assets[m[1]] = await fetchText(m[1]); } catch (e) { ns.print(`Update: skipped ${m[1]}: ${e}`); }
        }
        JSON.parse(assets[ASSETS.audio]);
        JSON.parse(assets[ASSETS.sprites]);

        for (const [name, text] of Object.entries(assets)) await ns.write(name, text, 'w');
        await ns.write('doom.js', remote, 'w'); // script last, once its assets are in place

        ns.tprint('Update complete. Restarting...');
        ns.exec('doom.js', 'home', 1, ...ns.args);   // same flags as this run
        return;
      }
    } catch (e) {
      ns.tprint(`Auto-update failed (${e}); running the installed version. Re-run install.js to update by hand.`); // not fatal: run the current version
    }
  }

  // ─── MAP ────────────────────────────────────────────────────────────────────
  // The map file is parsed ONCE into flat arrays (tile kinds, a solid mask, spawn lists). After this
  // nothing else in the game looks at map characters.
  // parseMap(levelIndex) turns a map file into the arrays below; it runs once per level, from startLevel(), and
  // REASSIGNS all of them (so do not hold on to an old array). Arrays are indexed by y * MW + x.
  //   tileKind    a TILE id (void and unknown characters stay WALL).        wallStyle   index into WALL_STYLE_IDS.
  //   blocked     1 = solid right now. Doors start blocked and updateDoors() clears/sets it from doorPos; secrets
  //               start blocked and tryUse() clears them for good.
  //   doorOpen    1 = the door is (being) opened, i.e. the TARGET state. doorPos 0..1 is how far it has actually
  //               moved; doorHold counts ticks until it auto-closes; doorList lists every door tile index.
  // spawns is consumed once, by startLevel(), to create the live `enemies` and `pickups` arrays; after that the map
  // characters are never consulted again. Rows may be ragged: a missing character is a wall. secretsTotal only
  // feeds the end-screen statistics. An empty/missing map file throws (shown in the terminal, game ends cleanly).
  if (CHAR_CONFLICTS.length) ns.tprint(`WARNING: map characters used twice: ${CHAR_CONFLICTS.join(', ')}`);

  let MW = 0, MH = 0, VIEW_DIST = 32;
  let tileKind, blocked, doorOpen, doorPos, doorHold, wallStyle, spawns;
  let doorKey = {};                 // tile index -> key id needed to open it
  let doorList = [];                // tile indices of every door
  let secretsTotal = 0;

  function parseMap(levelIndex) {
    const file = LEVELS[levelIndex].map;
    // Rows copied out of a JS/JSON array look like  "#....#",  : the leading quote and the trailing quote/comma are
    // blanked IN PLACE (not deleted, so every column keeps its position) and treated as void, with no warning.
    // Quotes or commas anywhere else in a row still trigger the unknown-character warning below.
    const rows = (ns.read(file) || '').split('\n').filter(line => line.length > 0)
      .map(r => r.trimEnd().replace(/^"/, ' ').replace(/",?$/, m => ' '.repeat(m.length)).trimEnd());
    if (!rows.length) throw new Error(`map file "${file}" is missing or empty`);
    MH = rows.length;
    MW = Math.max(...rows.map(r => r.length));
    tileKind = new Uint8Array(MW * MH).fill(TILE.WALL);   // void / unknown characters are solid wall
    blocked = new Uint8Array(MW * MH);                    // 1 = solid right now (walls, closed doors, secrets)
    doorOpen = new Uint8Array(MW * MH);
    doorPos = new Float32Array(MW * MH);
    doorHold = new Int16Array(MW * MH);
    wallStyle = new Uint8Array(MW * MH);
    doorKey = {};
    doorList = [];
    spawns = { player: { x: 1.5, y: 1.5 }, enemies: [], pickups: [], decor: [] };
    secretsTotal = 0;
    const unknown = new Set();
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const idx = y * MW + x, ch = rows[y][x];
        const info = CHAR_INFO[ch];
        if (!info) {
          if (ch !== undefined && ch !== ' ') unknown.add(ch);
          blocked[idx] = 1;
          continue;
        }
        const kind = TILE_IDS[info.tile];
        tileKind[idx] = kind;
        blocked[idx] = (kind === TILE.WALL || kind === TILE.DOOR || kind === TILE.SECRET) ? 1 : 0;
        const cx = x + 0.5, cy = y + 0.5;
        if (info.style) wallStyle[idx] = Math.max(0, WALL_STYLE_IDS.indexOf(info.style));
        if (kind === TILE.DOOR) doorList.push(idx);
        if (info.key) doorKey[idx] = info.key;
        if (info.player) spawns.player = { x: cx, y: cy };
        if (info.enemy) spawns.enemies.push({ type: info.enemy, x: cx, y: cy });
        if (info.pickup) spawns.pickups.push({ type: info.pickup, x: cx, y: cy });
        if (info.decor) spawns.decor.push({ type: info.decor, x: cx, y: cy });
        if (kind === TILE.SECRET) {
          secretsTotal++;
          const r = info.reward;
          if (r) spawns.pickups.push({ type: r.pickup, x: cx + (r.dx ?? 0), y: cy + (r.dy ?? 0), secret: true });
        }
      }
    }
    if (unknown.size) ns.tprint(`WARNING: map has unknown characters (treated as walls): ${[...unknown].join(' ')}`);
    // Walls further away than this are not drawn: the map's diagonal (so on most maps you can see every wall),
    // capped at 32. Far walls just get thinner and use the sparsest shade.
    VIEW_DIST = Math.min(32, Math.ceil(Math.hypot(MW, MH)));
    buildAutomapBase();   // fog + outline arrays for the new level (see AUTOMAP)
  }

  // ─── SPRITES (Individual PNG sprites) ───────────────────────────────────────
  // Load sprites from sprites.json (contains base64 PNGs for individual sprites)
  // Format: { "TypeName_animTypeN": "base64...", ... }
  // e.g., { "Cacodemon_walk1": "...", "Cacodemon_walk2": "...", "Cacodemon_attack1": "...", ... }
  // Only the JSON text is parsed here. Decoding into Image objects happens later in preloadSprites(), after the
  // title screen. A missing or invalid sprites.json is not fatal: everything falls back to ASCII art.
  let SPRITES;
  try {
    const SPRITES_JSON = ns.read(ASSETS.sprites);
    SPRITES = JSON.parse(SPRITES_JSON);
    ns.tprint(`SUCCESS: Loaded sprites.json, ${Object.keys(SPRITES).length} sprite entries`);
  } catch (e) {
    ns.tprint(`ERROR: Failed to load sprites.json: ${e}`);
    SPRITES = {};
  }

  // Cache: spriteCache[type] = { walk: [img...], attack: [img...], die: [img...] }
  // Each animation state contains an array of Image objects
  const spriteCache = {};

  // Load base64 image
  function createImageFromBase64(base64Str) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/png;base64,' + base64Str;
    });
  }

  // Sprite keys look like "Zombie_walk1", "Lost_Soul_attack2", "Cyber_Demon_projectile", "Imp_projectile_impact".
  // There is no generic (typeless) projectile art any more; every projectile or impact belongs to an enemy type.
  // The type is everything before the animation name with underscores removed and
  // upper-cased (Lost_Soul -> LOSTSOUL), so it matches the keys of ENEMIES / PICKUPS / PROJECTILES.
  const ANIM_KEY = /^(.+?)_(walk|attack|dead|death|die|idle|impact|projectile_impact|projectile)(\d*)$/i;
  // Turns a sprites.json key into { type, anim, frame }.
  //   type   the part before the animation word, underscores removed, upper-cased ("Lost_Soul" -> "LOSTSOUL").
  //          This is the string used as the key in ENEMIES / PICKUPS / PROJECTILES' `sprite` field.
  //   anim   'walk' | 'attack' | 'die' | 'idle' | 'impact'  (death, and the older spelling dead, -> die; projectile -> idle,
  //          projectile_impact -> impact). Anything unrecognised keeps its own name and is never used by the
  //          renderer, which only asks for the five above.
  //   frame  trailing number, default 1. Frames are sorted numerically in preloadSprites().
  // The regex handles the normal forms; the two fallbacks below handle old-style keys with no underscore ("projectile1") and
  // unusual names. Changing the naming scheme means keeping this function and the table `sprite` fields in step.
  function parseSpriteKey(key) {
    const m = key.match(ANIM_KEY);
    if (m) {
      let anim = m[2].toLowerCase();
      if (anim === 'dead' || anim === 'death') anim = 'die';
      else if (anim === 'projectile') anim = 'idle';
      else if (anim === 'projectile_impact') anim = 'impact';
      return { type: m[1].replace(/_/g, '').toUpperCase(), anim, frame: m[3] ? parseInt(m[3], 10) : 1 };
    }
    const us = key.indexOf('_');
    if (us === -1) {
      // "projectile1" style: single-frame sprite, treated as the idle animation
      return { type: key.replace(/\d+$/, '').toUpperCase(), anim: 'idle', frame: 1 };
    }
    const r = key.slice(us + 1).match(/^(.*?)(\d+)?$/);
    return { type: key.slice(0, us).toUpperCase(), anim: r[1].replace(/_+$/, '') || 'idle', frame: r[2] ? parseInt(r[2], 10) : 1 };
  }

  // Frames for a sprite type + animation. A missing animation falls back to a similar one so
  // something never silently vanishes (no attack frames -> walk frames, no impact -> idle ...).
  const FALLBACK_ANIM = { attack: 'walk', impact: 'idle', idle: 'walk', walk: 'idle' };
  // Returns the array of decoded Image objects for a sprite type + animation, or null if there is no art at all.
  // `type` may be false (used by ASCII-only projectiles); that simply yields null. EVERY caller must handle null,
  // because missing art is a normal state (the renderer then draws a glyph or blob). The loop follows
  // FALLBACK_ANIM at most three steps so a missing animation degrades instead of disappearing.
  function framesFor(type, anim) {
    const set = spriteCache[type];
    if (!set) return null;
    for (let a = anim, n = 0; a && n < 3; a = FALLBACK_ANIM[a], n++) if (set[a]?.length) return set[a];
    return null;
  }

  // Runs once, after the title screen. Fills spriteCache from the flat SPRITES object. If one sprite of a type
  // fails to decode, that type is reported and keeps only the animations decoded before the failure; other
  // types are unaffected. Must finish before checkGameData(), which asks framesFor() whether art exists.
  async function preloadSprites() {
    // Share images through SPRITE_ALIASES first, so aliases look like ordinary keys below
    for (const [alias, target] of Object.entries(SPRITE_ALIASES)) {
      if (SPRITES[alias] !== undefined) continue;
      if (SPRITES[target] === undefined) ns.tprint(`WARNING: SPRITE_ALIASES: "${alias}" points at "${target}", which is not in ${ASSETS.sprites}`);
      else SPRITES[alias] = SPRITES[target];
    }
    // Group the flat sprites.json into { TYPE: { anim: { frameNumber: base64 } } }
    const grouped = {};
    for (const [key, b64] of Object.entries(SPRITES)) {
      const { type, anim, frame } = parseSpriteKey(key);
      ((grouped[type] ??= {})[anim] ??= {})[frame] = b64;
    }

    // Decode into Image arrays, in parallel per animation
    for (const [type, animations] of Object.entries(grouped)) {
      try {
        spriteCache[type] = {};
        for (const [anim, framesObj] of Object.entries(animations)) {
          const frames = Object.entries(framesObj)
            .sort((a, b) => a[0] - b[0])
            .map(([, b64]) => b64);
          spriteCache[type][anim] = await Promise.all(frames.map(f => createImageFromBase64(f)));
        }
      } catch (e) {
        ns.tprint(`Failed to load sprites for ${type}: ${e}`);
      }
    }
    ns.print(`Sprite types loaded: ${Object.keys(spriteCache).join(', ')}`);
  }

  // ─── MAP QUERIES ────────────────────────────────────────────────────────────
  // Anything outside the map (or a NaN coordinate) counts as solid, so a bad position can never
  // crash the renderer or send a ray off forever.
  // solidAt() is the single source of truth for collision, line of sight, bullets and raycasting; it reads
  // `blocked`, so open doors and discovered secrets are passable automatically. tileAt() returns the tile KIND
  // instead and does not care whether a door is currently open (an open door is still TILE.DOOR).
  // Both take world coordinates (floats), not tile indices.
  function solidAt(fx, fy) {
    const mx = Math.floor(fx), my = Math.floor(fy);
    if (!(mx >= 0 && my >= 0 && mx < MW && my < MH)) return true;
    return blocked[my * MW + mx] === 1;
  }

  function tileAt(fx, fy) {
    const mx = Math.floor(fx), my = Math.floor(fy);
    if (!(mx >= 0 && my >= 0 && mx < MW && my < MH)) return TILE.WALL;
    return tileKind[my * MW + mx];
  }

  // ─── CONSTANTS ──────────────────────────────────────────────────────────────
  // W x H is the character grid. It is coupled to the DOM size: renderContainer is sized to W x H character cells by fitRenderBox() (660 x 368 px fallback), and the PNG overlay
  // converts columns/rows to pixels as clientWidth / W and clientHeight / H. If W, H, font size or line height
  // change, fitRenderBox() re-measures at startup; only the fallback size would need a manual update.
  const W = 90, H = 24;
  const TAU = Math.PI * 2;
  const FOV = 1.2;
  const SHADES = WALL_STYLES.stone.chars;  // dense (near) -> sparse (far); the default wall look
  const FLOOR_CHARS = ".,'▒";
  // One ready-made cell string per wall style and distance shade (the style's colour tag + glyph)
  const WALL_CELLS = WALL_STYLE_IDS.map(id => [...WALL_STYLES[id].chars].map(c => (WALL_STYLES[id].tag ?? '') + c));
  // Perpendicular distance of the floor seen on each screen row (mirrored for the ceiling). Derived from the wall
  // height formula in renderFrame (H / (perp * 0.82) rows), so the floor meets the base of a wall exactly.
  const FLOOR_PERP = new Float32Array(H);
  for (let y = 0; y < H; y++) FLOOR_PERP[y] = H / (0.82 * (2 * (y < H / 2 ? H - 1 - y : y) + 1 - H));
  const FACES = { normal: '}:)', hit: '>:(', lowHp: '}:o', dead: 'x:(' };
  const DEATH_FRAMES = 30;       // MINIMUM death animation length in ticks (a death with many frames lasts 2 ticks per frame, see deathLength)
  const ATTACK_ANIM_TICKS = 8;   // how long an enemy shows its attack frames after attacking (~300ms)
  // `owned` and `currentWeapon` are mutable game state even though they sit with the constants. They are changed by
  // collectPickup(), switchWeapon() and autoSwitch(), and read by shoot(), updateHud() and renderFrame().
  const owned = new Set(ALL_WEAPONS ? Object.keys(WEAPONS) : START.weapons);   // weapons the player has
  let currentWeapon = [...owned][0] ?? Object.keys(WEAPONS)[0];

  // ─── GAME STATE ─────────────────────────────────────────────────────────────

  // World position (px, py) is in tile units; pa is the view angle in radians (never wrapped, so it can grow without
  // bound; use angleDiff() or the double-modulo pattern when comparing angles).
  let px = 0, py = 0, pa = -Math.PI / 2;   // set from the map by startLevel()
  let health = START.health, armor = START.armor, kills = 0, score = 0;
  const ammo = {};                // rounds per AMMO_TYPES id; filled by resetLoadout()
  // ticks left of each timed power-up; `frozen` (can't walk, set by PROJECTILES freeze) is not a pickup but lives here so the
  // countdown, the HUD text and the reset on level start/retry come for free. freezeGrace = ticks of immunity to a new freeze.
  const powers = { invuln: 0, radsuit: 0, berserk: 0, frozen: 0 };
  let freezeGrace = 0;
  let levelIndex = 0, levelStart = null;   // index into LEVELS; snapshot of the loadout when the level began (for retry)
  let difficulty = DEFAULT_DIFFICULTY;     // key of DIFFICULTIES, chosen on the title screen
  let hazardTimer = 0, mouseTurn = 0;      // ticks until nukage hurts again; mouse movement not yet applied to pa
  const heldKeys = new Set();     // ids from KEYS
  let gameOver = false, won = false, showMap = false;
  let flashMsg = '', flashTimer = 0, flashStyle = '';
  let shootCooldown = 0, useCooldown = 0, prevUseKey = false;
  let muzzleFlash = 0;    // yellow muzzle flash frames
  let afterglow = 0;      // lingering flash after the first bloom
  let damageNumbers = []; // {screenX, screenY, val, ttl}: screen-grid cells, not world position; ttl in ticks
  let secretsFound = 0;
  let endTime = 0, endDrawn = false, faceHitTimer = 0;
  let gameStartTime = Date.now();
  const projectiles = [];  // everything in flight: enemy shots AND player weapon shots (see p.owner)
  const effects = [];      // short-lived visual markers: bullet impacts and explosion flashes (no gameplay effect)
  const pendingSpawns = [];   // enemies a spawner has announced with a warning spike: { x, y, type, parent, ttl } (see trySpawn)

  // Runtime records created from the spawn lists.
  //   pickup  { type (key of PICKUPS), x, y, alive, secret? }  consumed when alive becomes false.
  //  Both arrays are emptied and refilled in place by startLevel(); they are never reassigned.
  //   enemy   { type (key of ENEMIES), def (that table entry, shared), x, y, spawnX, spawnY, hp, maxHp,
  //             alive, deathFrame, isAttacking, attackTimer }
  //           alive=false && deathFrame>=0 is a corpse (death animation); deathFrame -1 means never died.
  //           attackTimer counts ticks of attack animation left; isAttacking is true while it is above 0.
  //          memX/memY/memTicks: where it last saw or heard the player and for how long it will keep going there;
  //          pain: ticks of flinching left; side: +1/-1, which way it sidesteps when blocked.
  //          spawned: true for enemies created by a spawner attack (see trySpawn); they are NOT part of the map's
  //          kill total and are removed from this array once their death animation ends. kids: the enemies this
  //          one has spawned (used to enforce maxAlive).
  const pickups = [];   // filled by startLevel()
  //   decor   { type (key of DECORATIONS), x, y, solid, r }  static scenery; never changes during a level (see DECORATIONS).
  const decor = [];     // filled by startLevel()
  const enemies = [];   // filled by startLevel()

  // ─── DOM SETUP ──────────────────────────────────────────────────────────────
  // DOM layout: root (fixed overlay) > titleBar, renderContainer (position:relative) > [pre (ASCII frame),
  // spriteOverlay (PNG sprites, pointer-events none, above pre)], then face and hud. The HUD is a static HTML
  // template; its value spans are looked up by id ('d-hp' ...) in HUD UPDATE and rewritten by updateHud().
  // A leftover root from a previous run (a script that was killed without cleanup) is removed first.
  // Because spriteOverlay is above pre, PNG sprites cover ASCII drawn at the same spot (crosshair, gun,
  // minimap, damage numbers). ASCII fallback sprites (glyph/blob) are drawn INTO the grid and do not have this problem.
  const doc = eval('document');
  const old = doc.getElementById('ascii-doom-root');
  if (old) old.remove();

  const root = doc.createElement('div');
  root.id = 'ascii-doom-root';
  Object.assign(root.style, {
    position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '99999', background: '#000', border: '2px solid #600',
    borderRadius: '6px', padding: '10px 12px 8px', fontFamily: 'monospace',
    fontSize: '13px', lineHeight: '1.18', color: '#fff',
    boxShadow: '0 0 40px #300', minWidth: '660px', cursor: 'default',
    transition: 'background 0.05s'
  });
  root.tabIndex = 0;

  const titleBar = doc.createElement('div');
  titleBar.style.cssText = 'color:#e00;font-size:13px;font-weight:bold;letter-spacing:3px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;';
  //titleBar.innerHTML = '<span>█ BITBURNER DOOM █ <span style="color:#666;font-size:10px">E1M1: Hangar  ★</span></span>';
  const closeBtn = doc.createElement('span');
  closeBtn.textContent = '[ESC]';
  closeBtn.style.cursor = 'pointer';
  closeBtn.addEventListener('click', () => running = false);
  titleBar.appendChild(closeBtn);
  root.appendChild(titleBar);

  // Container for pre and sprite overlay (to prevent innerHTML clearing the overlay)
  const renderContainer = doc.createElement('div');
  renderContainer.style.cssText = 'position:relative;width:660px;height:368px;';
  root.appendChild(renderContainer);

  // Floor + sky picture layer (see FLATS). A canvas under the text: the ASCII frame leaves floor/ceiling cells blank
  // and this shows through. Hidden whenever there is no textured floor/sky (title screen, automap, missing art).
  const flatCanvas = doc.createElement('canvas');
  flatCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;image-rendering:pixelated;display:none;';
  renderContainer.appendChild(flatCanvas);

  const pre = doc.createElement('pre');
  pre.style.cssText = 'margin:0;white-space:pre;color:#0c0;position:absolute;top:0;left:0;width:100%;height:100%;';
  renderContainer.appendChild(pre);

  // Sprite overlay for PNG sprites (sibling of pre, positioned over it)
  const spriteOverlay = doc.createElement('div');
  spriteOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:10;';
  renderContainer.appendChild(spriteOverlay);

  const hud = doc.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;border-top:1px solid #400;margin-top:6px;padding-top:4px;font-size:11px;flex-wrap:wrap;gap:4px;';
  hud.innerHTML = `
    <span>❤️ HP: <span id="d-hp" style="color:#e00">100</span></span>
    <span>🛡️ ARMOR: <span id="d-armor" style="color:#0af">0</span></span>
    <span>🔫 <span id="d-wpn" style="color:#aaa">PISTOL</span></span>
    <span>⭐ <span id="d-ammo" style="color:#e00">50 BULLETS</span></span>
    <span>💀 KILLS: <span id="d-kills" style="color:#e00">0</span></span>
    <span>🏆 SCORE: <span id="d-score" style="color:#e00">0</span></span>
    <span id="d-key" style="color:#444">NO KEY</span>
    <span id="d-power" style="color:#f6f"></span>
    <span id="d-hint" style="color:#666"></span>
    <span id="d-pos" style="color:#0cc">X:0.0 Y:0.0</span>`
    ;
  root.appendChild(hud);

  const face = doc.createElement('div');
  face.style.cssText = 'font-size:40px;letter-spacing:-2px;margin-bottom:6px;transform:rotate(-90deg);display:inline-block;visibility:hidden;';
  face.innerHTML = '<span id="d-face">}:)</span>';
  root.insertBefore(face, hud);

  doc.body.appendChild(root);
  root.focus();
  fitRenderBox();

  // Bitburner's terminal grabs keyboard focus again after the run command returns, which is why focus is
  // taken several times (now, +100 ms, +300 ms) and again on every click via refocusHandler.
  // Measure the real character cell size of the <pre> (it depends on the browser/font) and size the render box
  // to exactly W x H cells. The PNG overlay converts columns/rows to pixels with clientWidth / W, so without this
  // the sprites drift away from the ASCII if the font is not exactly 660/W px wide. If measuring is impossible
  // (no layout), the fixed 660 x 368 box set above stays.
  function fitRenderBox() {
    try {
      const m = doc.createElement('pre');
      m.style.cssText = 'margin:0;position:absolute;visibility:hidden;white-space:pre;';
      m.textContent = ('M'.repeat(W) + '\n').repeat(H - 1) + 'M'.repeat(W);
      root.appendChild(m);
      const r = m.getBoundingClientRect();
      m.remove();
      if (r.width > 100 && r.height > 100) {
        renderContainer.style.width = Math.ceil(r.width) + 'px';
        renderContainer.style.height = Math.ceil(r.height) + 'px';
      }
    } catch (e) { /* keep the fixed size */ }
  }
  // Steal focus from terminal — it re-grabs after the run command finishes,
  // so we defer a couple of attempts to win the race.
  const termInput = doc.querySelector('.terminal-input');
  if (termInput) termInput.blur();
  setTimeout(() => { if (termInput) termInput.blur(); root.focus(); }, 100);
  setTimeout(() => { if (termInput) termInput.blur(); root.focus(); }, 300);

  // Re-steal focus any time the user clicks anywhere in the document,
  // in case the terminal or another element grabs it mid-game.
  const refocusHandler = () => { if (running && !terminalEl) root.focus(); };
  doc.addEventListener('click', refocusHandler);

  // ─── INPUT ──────────────────────────────────────────────────────────────────
  // Input model: `keys` maps a normalised key name to true while it is held. The game never reacts to key events
  // directly except for edge-triggered actions handled in onKey (Escape, Tab minimap, M automap, P pause, weapon number keys), and mouse look (mousemove adds to mouseTurn, applied by updateGame).
  // Everything else (movement, shooting, F to use) is polled from `keys` once per tick in updateGame(), and the
  // title loop polls Enter/Space the same way. BLOCKED_KEYS get preventDefault so the browser/game UI doesn't react.
  const win = eval('window');
  const keys = {};
  // Letters are normalised to lowercase so Shift/CapsLock can't leave a key "stuck" down.
  const normKey = k => (k.length === 1 ? k.toLowerCase() : k);
  const BLOCKED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
    'w', 'a', 's', 'd', 'q', 'e', 'f', 'p', 'm', 'Tab', 'Escape', ...Object.keys(WEAPON_KEYS)]);
  // Pause: P toggles it, and losing window focus turns it on (so enemies can't kill you while you are in another
  // tab). Only meaningful during play (inGame, set by the frame loop). While paused the frame loop skips updateGame
  // and just redraws with a PAUSED message; the elapsed pause time is added to gameStartTime so the clock ignores it.
  let paused = false, inGame = false, pausedAt = 0;
  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    if (p) pausedAt = Date.now(); else gameStartTime += Date.now() - pausedAt;
  }
  // ── TERMINAL OVERLAY ─────────────────────────────────────────────────────────────
  // A decoration with use:'terminal' opens the web version of Bitburner (TUNING.terminalUrl) in an iframe laid over the
  // whole page (appended to document.body: root has a transform, which would make a fixed child relative to it). The
  // game is paused while it is open and the pointer is released; the game ignores the keyboard (so typing in Bitburner
  // does not walk you around) except Escape, which closes it. The page may refuse to load inside a frame (the desktop
  // app can); the header therefore also has a plain link to open it in a browser tab. Esc inside the frame never reaches
  // the game, so the [X] button is the sure way out. terminalResume remembers whether to unpause on close.
  let terminalEl = null, terminalResume = false;
  function openTerminal() {
    if (terminalEl) return;
    terminalResume = !paused;
    setPaused(true);
    for (const k in keys) keys[k] = false;
    try { doc.exitPointerLock?.(); } catch (e) { }
    const url = TUNING.terminalUrl;
    terminalEl = doc.createElement('div');
    terminalEl.style.cssText = 'position:fixed;top:30px;left:5%;width:90%;height:calc(100% - 60px);z-index:100000;background:#000;' +
      'border:2px solid #0a0;box-shadow:0 0 40px #030;display:flex;flex-direction:column;font:bold 13px monospace;color:#0f0;';
    const bar = doc.createElement('div');
    bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #0a0;';
    const title = doc.createElement('span');
    title.textContent = 'TERMINAL: if the page below is blank, it was blocked, use the link  ->  ';
    const link = doc.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '[open in a tab]';
    link.style.color = '#6f6';
    title.appendChild(link);
    const x = doc.createElement('span');
    x.textContent = '[X] CLOSE (Esc)';
    x.style.cursor = 'pointer';
    x.addEventListener('click', closeTerminal);
    bar.appendChild(title); bar.appendChild(x);
    const frame = doc.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'flex:1;border:0;background:#111;';
    terminalEl.appendChild(bar); terminalEl.appendChild(frame);
    doc.body.appendChild(terminalEl);
  }
  function closeTerminal() {
    if (!terminalEl) return;
    terminalEl.remove(); terminalEl = null;
    for (const k in keys) keys[k] = false;
    if (terminalResume) setPaused(false);
    root.focus();
  }
  function onKey(e) {
    const k = normKey(e.key);
    if (terminalEl) {   // the overlay owns the keyboard: only Escape (close it) is ours
      if (e.type === 'keydown' && k === 'Escape') closeTerminal();
      return;
    }
    if (e.type === 'keydown') {
      keys[k] = true;
      if (k === 'Escape') running = false;
      if (k === 'p' && !e.repeat && inGame && !gameOver && !won) { if (automapOpen) closeAutomap(); else setPaused(!paused); }
      if (k === 'm' && !e.repeat && inGame && !gameOver && !won) toggleAutomap();
      if (k === 'Tab' && !e.repeat) showMap = !showMap;
      if (WEAPON_KEYS[k] && !e.repeat) switchWeapon(WEAPON_KEYS[k]);
      if (BLOCKED_KEYS.has(k)) e.preventDefault();
    } else {
      keys[k] = false;
    }
  }
  function onBlur() {   // don't keep walking after alt-tab, and pause so nothing happens while you're away
    for (const k in keys) keys[k] = false;
    if (inGame && !gameOver && !won) setPaused(true);
  }
  // Mouse look: clicking the game captures the pointer (browser pointer lock); movement then turns the player and
  // the left button shoots. Movement is accumulated in mouseTurn and applied once per tick by updateGame().
  const onMouseMove = e => { if (TUNING.mouseLook && doc.pointerLockElement === root) mouseTurn += (e.movementX || 0) * TUNING.mouseSensitivity; };
  const onMouseDown = e => { if (doc.pointerLockElement === root && e.button === 0) keys['mouse0'] = true; };
  const onMouseUp = e => { if (e.button === 0) keys['mouse0'] = false; };
  root.addEventListener('click', () => {
    if (!TUNING.mouseLook || !running || terminalEl || doc.pointerLockElement === root || !root.requestPointerLock) return;
    try { const p = root.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
  });
  doc.addEventListener('mousemove', onMouseMove);
  doc.addEventListener('mousedown', onMouseDown);
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('keyup', onKey);
  win.addEventListener('blur', onBlur);

  // `running` is the single "keep going" flag: every loop tests it, and ESC, the [ESC] button, cleanup() and the end
  // screen's ESC all just set it to false. cleanup() is idempotent (cleanedUp) and is called from the main loop's
  // finally block, from early returns, and from ns.atExit. It uses audioCtx, which is declared further down; the
  // try/catch around it makes an early call harmless.
  let running = true;
  let cleanedUp = false;
  let musicSrc = null;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    running = false;
    try { musicSrc?.stop(); } catch (e) { }
    try { audioCtx.close(); } catch (e) { }
    try { terminalEl?.remove(); } catch (e) { }
    root.remove();
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('keyup', onKey);
    doc.removeEventListener('click', refocusHandler);
    win.removeEventListener('blur', onBlur);
    doc.removeEventListener('mousemove', onMouseMove);
    doc.removeEventListener('mousedown', onMouseDown);
    doc.removeEventListener('mouseup', onMouseUp);
    try { doc.exitPointerLock?.(); } catch (e) { }
  }
  // If the script is killed from outside (not via ESC) still tidy up the DOM, listeners and music.
  if (typeof ns.atExit === 'function') ns.atExit(cleanup);

  // ─── HUD UPDATE ─────────────────────────────────────────────────────────────
  // hudEl caches the HUD value nodes. updateHud() runs every frame and after any change to health, armor, ammo,
  // kills, score or weapon; it only touches textContent, and rewrites the key list and the controls hint only when
  // their text changed. To add a stat: add a span with id "d-<name>" to the HUD template, add the name to the list
  // below, and set it in updateHud().
  const hudEl = {};
  for (const id of ['hp', 'armor', 'wpn', 'ammo', 'kills', 'score', 'key', 'pos', 'hint', 'power']) hudEl[id] = root.querySelector('#d-' + id);
  const faceEl = root.querySelector('#d-face');

  let lastKeyHtml = '', lastHint = '', lastPower = '';
  function updateHud() {
    hudEl.hp.textContent = Math.floor(health);
    hudEl.armor.textContent = Math.floor(armor);

    hudEl.kills.textContent = kills;
    hudEl.score.textContent = score;
    const wpn = WEAPONS[currentWeapon];
    hudEl.wpn.textContent = wpn.name;
    hudEl.wpn.style.color = wpn.color;
    hudEl.ammo.textContent = wpn.ammoType ? `${Math.floor(ammo[wpn.ammoType])} ${AMMO_TYPES[wpn.ammoType].name}` : '-';
    const power = Object.entries(powers).filter(([, t]) => t > 0).map(([k, t]) => `${k.toUpperCase()} ${Math.ceil(t / 25)}s`).join(' ');
    if (power !== lastPower) { hudEl.power.textContent = power; lastPower = power; }
    if (heldKeys.size) {
      const html = 'KEYS: ' + [...heldKeys].map(k => `<span style="color:${KEYS[k].color}">${KEYS[k].hud}</span>`).join(' ');
      if (html !== lastKeyHtml) { hudEl.key.style.color = '#aaa'; hudEl.key.innerHTML = html; lastKeyHtml = html; }
    }
    const hint = Object.values(WEAPONS).filter(w => owned.has(w.id)).sort((a, b) => a.key.localeCompare(b.key))
      .map(w => `${w.key}=${w.name[0]}${w.name.slice(1).toLowerCase()}`).join(' ') + ' • WASD • F Use • Tab Minimap • M Map';
    if (hint !== lastHint) { hudEl.hint.textContent = hint; lastHint = hint; }
    hudEl.pos.textContent = `X:${px.toFixed(1)} Y:${py.toFixed(1)}`;
  }

  // The big centre-screen message. style: a key of FLASH_STYLES ('', 'boss', 'secret').
  // There is only ONE message slot: a newer flash() replaces the current one. The timer counts down in
  // updateGame() (ticks), and renderFrame() appends the message as an absolutely positioned div inside <pre>
  // after pre.innerHTML has been set (so it is recreated every frame). Use 9999 ticks for "until the game ends".
  function flash(msg, ticks = 25, style = '') { flashMsg = msg; flashTimer = ticks; flashStyle = style; }

  // ─── PICKUPS ───────────────────────────────────────────────────────────────
  // Applies a PICKUPS entry to the player. Input: def (an entry of PICKUPS, not an id). Side effects: raises
  // health/armor up to STAT_MAX and ammo (scaled by difficulty) up to AMMO_TYPES[].max, starts a timed power-up (def.power), adds a key to heldKeys, for weapon pickups adds to `owned` and switches to the
  // weapon the FIRST time, plays def.sound, shows def.msg and refreshes the HUD. Called only from updateGame().
  // False if touching this pickup would do nothing because everything it gives is already at its maximum.
  // Keys, weapons and power-ups always count as useful.
  function pickupUseful(def) {
    const g = def.give;
    if (def.weapon || g.key || def.power) return true;
    if (g.health && health < STAT_MAX.health) return true;
    if (g.armor && armor < STAT_MAX.armor) return true;
    if (g.ammo) for (const t in g.ammo) if (ammo[t] < AMMO_TYPES[t].max) return true;
    return !(g.health || g.armor || g.ammo);
  }

  function collectPickup(def) {
    const g = def.give;
    if (g.health) health = Math.min(STAT_MAX.health, health + g.health);
    if (g.armor) armor = Math.min(STAT_MAX.armor, armor + g.armor);
    if (g.ammo) {
      const scale = DIFFICULTIES[difficulty].ammoPickup;
      for (const [type, n] of Object.entries(g.ammo)) ammo[type] = Math.min(AMMO_TYPES[type].max, ammo[type] + Math.round(n * scale));
    }
    if (g.key) heldKeys.add(g.key);
    if (def.power) powers[def.power] = TUNING.powerTicks[def.power];
    if (def.weapon) {
      // Like Doom: picking up a weapon you didn't have yet switches to it
      if (!owned.has(def.weapon)) { owned.add(def.weapon); currentWeapon = def.weapon; }
    }
    if (def.sound) play(def.sound, 0.8);
    flash(def.msg, 25);
    updateHud();
  }

  // ─── TAKE DAMAGE ───────────────────────────────────────────────────────────
  // Low-level health/armor arithmetic. Scales by the difficulty's damageTaken, then returns the damage that actually reached health. Does NOT play sounds,
  // update the face or handle death; use hurtPlayer() for anything that hurts the player. Armor absorbs half of each
  // hit (until armor runs out). INFINITE_HEALTH makes it a no-op that returns 0.
  function takeDamage(dmg, bypassArmor = false) {
    if (INFINITE_HEALTH || powers.invuln > 0) return 0;

    let actualDamage = dmg * DIFFICULTIES[difficulty].damageTaken;

    // Armor soaks up to half of each hit, and is used up by exactly the amount it soaked
    if (!bypassArmor && armor > 0) {
      const absorbed = Math.min(armor, actualDamage * 0.5);
      actualDamage -= absorbed;
      armor -= absorbed;
    }

    health = Math.max(0, health - actualDamage);
    updateHud();

    return actualDamage;
  }

  // One place for "the player got hurt": damage, sound, face, message, death.
  // THE entry point for "the player got hurt" (enemy melee, enemy projectiles, explosions, death explosions).
  // Options: bypass (ignore armor), volume (0 = silent, the caller plays its own sound), ignoreCritical (keep showing
  // the damage label even when health is below 30), style (FLASH_STYLES key). Side effects: face expression, flash
  // message, and on death sets gameOver/endTime and shows YOU DIED. Does nothing once gameOver is set or while invulnerable.
  function hurtPlayer(dmg, label = 'HIT!', { bypass = false, volume = 0.8, ignoreCritical = false, style = '' } = {}) {
    if (gameOver || powers.invuln > 0) return;   // invulnerable: no damage, no pain feedback
    const actual = takeDamage(dmg, bypass);
    if (volume > 0) play(SOUNDS.hurt, volume);
    faceEl.textContent = health <= 0 ? FACES.dead : health < 30 ? FACES.lowHp : FACES.hit;
    faceHitTimer = 12; // ~500ms at 40ms per tick
    if (!ignoreCritical && health < 30) flash('CRITICAL!', 20);
    else flash(actual > 0 ? `${label} -${Math.ceil(actual)}` : '', 20, style);
    if (health <= 0) {
      gameOver = true;
      endTime = Date.now();
      flash('YOU DIED', 9999);
      play(SOUNDS.death, 1.0);
    }
  }

  // ─── AUDIO ──────────────────────────────────────────────────────────────────
  // Audio lifecycle: the AudioContext and the raw audio.json text are read immediately (a broken audio.json aborts the
  // game via cleanup + return). The base64 sounds are only DECODED later by loadAllSounds(), after the title
  // screen, which is also when the context is resumed (browsers require a user gesture). Until then sfx is empty
  // and play() is silent, which is intentional and harmless.
  const audioCtx = new (win.AudioContext || win.webkitAudioContext)();
  let audioData;
  try {
    audioData = JSON.parse(ns.read(ASSETS.audio));
  } catch (e) {
    ns.tprint(`ERROR: Failed to load ${ASSETS.audio}: ${e}`);
    cleanup();
    return;
  }

  // Every entry in audio.json is decoded and kept by name, so a new sound only needs adding to the file.
  const sfx = {};
  async function loadAllSounds() {
    await Promise.all(Object.keys(audioData).map(async name => {
      try {
        const response = await fetch(`data:audio/wav;base64,${audioData[name]}`);
        sfx[name] = await audioCtx.decodeAudioData(await response.arrayBuffer());
      } catch (e) {
        ns.tprint(`WARNING: could not decode sound "${name}": ${e}`);
      }
    }));
  }

  // Play a sound by name. Unknown names are silent (checkGameData reports them once at startup).
  // Fire-and-forget playback by sound name. Resolution order: sfx[name], then sfx[SOUND_FALLBACKS[name]], else silence.
  // Only ONE level of fallback is followed. `pan` is -1 (left) .. 1 (right); 0 skips the panner node entirely. Each
  // call creates new source and gain nodes (they are garbage collected when the sound ends); there is no voice limit.
  // Use playAt() for sounds that happen somewhere in the world.
  function play(name, volume = 1.0, pan = 0) {
    const buffer = sfx[name] ?? sfx[SOUND_FALLBACKS[name]];   // missing sound -> placeholder (or silence)
    if (!buffer) return;
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain);
    if (pan !== 0 && audioCtx.createStereoPanner) {
      const panner = audioCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(audioCtx.destination);
    } else {
      gain.connect(audioCtx.destination);
    }
    src.start();
  }

  // A sound that happens in the world at (x, y): quieter with distance (silent at TUNING.soundRange), halved when
  // a wall is in the way, and panned left/right by where it is relative to where the player faces.
  function playAt(name, x, y, volume = 1.0) {
    const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
    let v = volume * Math.max(0, 1 - d / TUNING.soundRange);
    if (d > 1.5 && !hasLineOfSight(x, y, px, py)) v *= 0.5;
    if (v < 0.02) return;
    play(name, v, d < 1 ? 0 : Math.sin(Math.atan2(dy, dx) - pa));
  }

  // Startup sanity check: everything the tables refer to should exist in audio.json / sprites.json.
  // One-time startup validation, called after preloadSprites() and loadAllSounds() (it needs framesFor() and sfx).
  // It collects every sound name the tables mention, reports which will use placeholders and which are missing, flags
  // enemies without walk sprites, and projectiles that would be invisible. SIDE EFFECT: it replaces e.attacks of
  // each ENEMIES entry with a filtered array that drops malformed attacks (unknown projectile, bad range, no melee
  // damage). Live enemies see the change because they share the ENEMIES entry through `def`. Output goes to the
  // Bitburner terminal via ns.tprint; nothing here stops the game from starting. It also checks every weapon's ammoType and that each LEVELS map file exists.
  // "Did you mean" for sprite names. Art is matched by exact name, so a typo in sprites.json (say Hanging_Bodyy_2_idle1)
  // silently leaves the thing as an ASCII placeholder. suggestSprite('HANGINGBODY2idle1') compares the expected name
  // (underscores and case ignored) with the sprites.json keys that no table uses, and returns the closest one within
  // a couple of typos, or ''. Keys whose type already belongs to something (e.g. Hanging_Body_1 when looking for
  // body 2) are never suggested.
  function suggestSprite(expected) {
    const norm = k => k.toLowerCase().replace(/_/g, '');
    const dist = (a, b) => {   // edit distance; swapping two neighbouring letters (idel for idle) counts as ONE typo
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
        }
      }
      return m[a.length][b.length];
    };
    const known = new Set([...Object.keys(ENEMIES), ...Object.keys(DECORATIONS), ...Object.entries(PICKUPS).map(([id, p]) => p.sprite ?? id.toUpperCase()),
      ...Object.values(PROJECTILES).map(p => p.sprite).filter(Boolean), 'SKY', 'FLOOR', 'CEILING']);
    const want = norm(expected);
    let best = '', bestD = Math.max(2, Math.ceil(want.length * 0.15)) + 1;
    for (const k of Object.keys(SPRITES || {})) {
      if (known.has(parseSpriteKey(k).type)) continue;
      const d = dist(want, norm(k));
      if (d < bestD) { best = k; bestD = d; }
    }
    return best;
  }
  // " (did you mean "X"?)" or '' for a placeholder thing whose art may be misspelled
  const hint = expected => { const k = suggestSprite(expected); return k ? `  <- did you mean "${k}"?` : ''; };

  function checkGameData() {
    const problems = [], placeholderEnemies = [], placeholderDecor = [];
    const sounds = new Set(Object.values(SOUNDS));
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (w.sound) sounds.add(w.sound);
      if (w.hitSound) sounds.add(w.hitSound);
      if (w.fire === 'projectile' && !PROJECTILES[w.projectile]) problems.push(`weapon ${id}: unknown projectile "${w.projectile}"`);
      if (w.ammoType != null && !AMMO_TYPES[w.ammoType]) problems.push(`weapon ${id}: unknown ammoType "${w.ammoType}"`);
    }
    for (const p of Object.values(PICKUPS)) if (p.sound) sounds.add(p.sound);
    for (const lv of LEVELS) if (!(ns.read(lv.map) || '').trim()) problems.push(`level "${lv.name}": map file ${lv.map} is missing or empty`);
    for (const [id, e] of Object.entries(ENEMIES)) {
      Object.values(e.sounds).forEach(s => sounds.add(s));
      if (e.onDeath?.explode?.sound) sounds.add(e.onDeath.explode.sound);
      if (!framesFor(id, 'walk')) {
        if (e.blob) placeholderEnemies.push(id + hint(id + 'walk1'));   // visible as an ASCII body until art is added: not a problem
        else problems.push(`${id}: no walk sprites found (expected keys like "${id[0]}${id.slice(1).toLowerCase()}_walk1")`);
      }
      // A broken attack entry is switched off (with a message) rather than crashing the game mid-fight
      e.attacks = e.attacks.filter(a => {
        const bad = msg => { problems.push(`${id}: ${msg} (this attack is disabled)`); return false; };
        if (a.kind !== 'ranged' && a.kind !== 'melee' && a.kind !== 'spawn') return bad(`attack kind must be 'ranged', 'melee' or 'spawn'`);
        if (!Array.isArray(a.range) || a.range.length !== 2 || !(a.chance >= 0)) return bad('attack needs range: [min, max] and chance');
        if (a.kind === 'ranged' && !PROJECTILES[a.projectile]) return bad(`unknown projectile "${a.projectile}"`);
        if (a.muzzles && !(Array.isArray(a.muzzles) && a.muzzles.length && a.muzzles.every(Number.isFinite))) return bad('muzzles must be a non-empty list of numbers');
        if (a.kind === 'melee' && !(a.damage > 0)) return bad('melee attack needs a damage number');
        if (a.kind === 'spawn' && a.spawn !== 'any' && ![].concat(a.spawn).every(t => ENEMIES[t])) return bad(`spawn must be 'any' or enemy ids from ENEMIES`);
        if (a.sound) sounds.add(a.sound);
        return true;
      });
    }
    for (const [id, d] of Object.entries(DECORATIONS)) {
      if (spriteCache[id]?.idle?.length) continue;
      if (!d.glyph && !d.blob) problems.push(`decoration ${id}: no "<Type>_idle1" sprite and no ASCII glyph/blob, it would be invisible`);
      else placeholderDecor.push(id + hint(id + 'idle1'));   // drawn as ASCII until art is added
    }
    for (const [id, p] of Object.entries(PROJECTILES)) {
      if (p.explosionSound) sounds.add(p.explosionSound);
      const type = p.sprite || null;
      if (type && !p.blob && !spriteCache[type]?.idle?.length) problems.push(`projectile ${id}: no ${type}_projectile sprite in ${ASSETS.sprites}${hint(type + 'projectile')}`);
      else if (type && !spriteCache[type]?.idle?.length && hint(type + 'projectile')) problems.push(`projectile ${id}: drawn as ASCII, no ${type}_projectile sprite${hint(type + 'projectile')}`);
      if (!type && !p.blob) problems.push(`projectile ${id}: no sprite and no ASCII "blob", it would be invisible`);
    }
    const placeholders = [];
    for (const s of sounds) {
      if (sfx[s]) continue;
      const fb = SOUND_FALLBACKS[s];
      if (fb && sfx[fb]) placeholders.push(`${s}  (playing "${fb}" for now)`);
      else problems.push(`missing sound "${s}" in ${ASSETS.audio}`);
    }
    if (placeholders.length) ns.tprint(`PLACEHOLDER SOUNDS: add these names to ${ASSETS.audio} to replace them:\n  ${placeholders.join('\n  ')}`);
    if (placeholderEnemies.length) ns.tprint(`ASCII PLACEHOLDER ENEMIES (no sprites yet): ${placeholderEnemies.join(', ')}`);
    if (placeholderDecor.length) ns.tprint(`ASCII PLACEHOLDER DECORATIONS (no sprite yet):\n  ${placeholderDecor.join('\n  ')}`);
    if (problems.length) ns.tprint(`DATA WARNINGS:\n  ${problems.join('\n  ')}`);
  }

  // ─── RAYCASTING (DDA grid traversal) ────────────────────────────────────────
  // Instead of creeping along each ray in 0.08 steps, jump from grid line to grid line. That is
  // exact (no overshoot into the wall), needs ~20 map lookups per ray instead of up to 120, and
  // tells us which face of the wall was hit.
  // Walls further away than this are not drawn. Defaults to the map's diagonal (so on most maps you can
  // see every wall), capped at 32. Far walls just get thinner and use the sparsest shade.
  // VIEW_DIST (how far walls and sprites are drawn) is set by parseMap() for each level.

  // These arrays have one slot per screen column and are overwritten by the first loop of renderFrame(). Later
  // parts of the same frame read them: wall drawing uses wallPerp/wallH/wallSide/wallTile/wallIdx, sprite occlusion and
  // drawBlob use wallDist. They are only meaningful between that loop and the end of the frame.
  // Per-frame column buffers, allocated once
  const frameWallDist = new Float32Array(W);   // true distance along the ray (used for sprite occlusion)
  const frameWallPerp = new Float32Array(W);   // perpendicular distance (used for height/shading: no fisheye)
  const frameWallH = new Int32Array(W);
  const frameWallSide = new Uint8Array(W);     // 0 = hit an east/west face, 1 = hit a north/south face
  const frameWallTile = new Uint8Array(W).fill(TILE.WALL);  // kind of tile each ray hit
  const frameWallIdx = new Int32Array(W);                   // index of the tile each ray hit

  // Written by castRay() as a side effect and valid only immediately after a call that returned less than 100
  // (a miss leaves them stale). renderFrame() copies them into the per-column arrays right after each call.
  // Result of the last castRay() (avoids allocating an object per ray)
  let hitSide = 0, hitTX = 0, hitTY = 0;

  // Returns the distance to the first wall along `angle`, or 100 if nothing is within VIEW_DIST.
  // Standard DDA ray march from (px, py). Returns the TRUE (not perpendicular) distance to the first solid tile,
  // or 100 as a "nothing within VIEW_DIST" sentinel that renderFrame() tests with `t < 100`. Solidity comes from
  // solidAt(), so closed doors, secrets and map edges stop rays while open doors do not. The 96-iteration cap is a
  // safety net; a 32-tile ray needs at most about 45 steps.
  function castRay(angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let mapX = Math.floor(px), mapY = Math.floor(py);
    const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);   // ray length per whole tile in x
    const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    const stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1;
    let sideX = (dx < 0 ? px - mapX : mapX + 1 - px) * deltaX;  // ray length to the next x grid line
    let sideY = (dy < 0 ? py - mapY : mapY + 1 - py) * deltaY;
    for (let i = 0; i < 96; i++) {
      let t;
      if (sideX < sideY) { t = sideX; sideX += deltaX; mapX += stepX; hitSide = 0; }
      else { t = sideY; sideY += deltaY; mapY += stepY; hitSide = 1; }
      if (t > VIEW_DIST) break;
      if (solidAt(mapX + 0.5, mapY + 0.5)) { hitTX = mapX; hitTY = mapY; return t; }
    }
    return 100;
  }

  // True if nothing solid lies between the two points (same traversal, stopping at the target).
  // Used by enemy AI (can it see/attack me), splash damage, melee, and sprite visibility. It is the same traversal as
  // castRay() but stops at the target and ignores the target's own tile. Returns true if the 128-step cap is hit,
  // which only matters for targets more than ~90 tiles away. Closed doors block sight, so enemies behind them neither
  // chase nor shoot.
  function hasLineOfSight(ex, ey, tx, ty) {
    const ddx = tx - ex, ddy = ty - ey;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (!Number.isFinite(dist) || dist < 1e-6) return true;
    const dx = ddx / dist, dy = ddy / dist;
    let mapX = Math.floor(ex), mapY = Math.floor(ey);
    const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    const stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1;
    let sideX = (dx < 0 ? ex - mapX : mapX + 1 - ex) * deltaX;
    let sideY = (dy < 0 ? ey - mapY : mapY + 1 - ey) * deltaY;
    for (let i = 0; i < 128; i++) {
      let t;
      if (sideX < sideY) { t = sideX; sideX += deltaX; mapX += stepX; }
      else { t = sideY; sideY += deltaY; mapY += stepY; }
      if (t >= dist) return true;                       // reached the target tile
      if (solidAt(mapX + 0.5, mapY + 0.5)) return false;
    }
    return true;
  }

  // ─── AUTOMAP ────────────────────────────────────────────────────────────────
  // The M key opens a full-screen map and pauses the game (it reuses the pause machinery: setPaused). Closing it
  // resumes the game only if it was running when the map was opened (automapResume), so M after P stays paused.
  // Fog of war: `explored[idx]` is 1 once the player has had line of sight to that tile (updateExplored, run from
  // updateGame via exploreStep). Only explored tiles show their contents. Three things ignore the fog on purpose:
  //   * the OUTLINE: `outline[idx]` marks the wall tiles on the outer boundary of the level (computed once per level
  //     by buildAutomapBase), so the overall shape is always visible but the rooms inside it are not;
  //   * the exit tile (always marked, so the player knows where to head);
  //   * pickups that are still lying around (except secret-room rewards until that spot is explored).
  // Enemies are never shown. Both arrays are REASSIGNED by parseMap() through buildAutomapBase(), so never keep a
  // reference to them. The map is drawn by renderAutomap(), which overwrites the whole ASCII grid at the end of
  // renderFrame(); if the level is too big for the screen it is shrunk by whole-tile blocks (see sx / sy in renderAutomap).
  const AUTOMAP_REVEAL_RADIUS = 14;   // how far (tiles) the player reveals; line of sight still applies
  const AUTOMAP_EXPLORE_TICKS = 6;    // re-scan at least this often even when standing still (doors open/close)
  let explored = new Uint8Array(0), outline = new Uint8Array(0);
  let automapOpen = false, automapResume = false, exploreTile = -1, exploreTimer = 0;

  // Called by parseMap() for every new level: clears the fog and finds the outer boundary. A wall tile is "outline"
  // if any of its 8 neighbours is OUTSIDE, where outside = off the map, or solid tiles with no walkable neighbour
  // that connect (4-way) to the map edge through such tiles. That keeps thin internal walls out of the outline,
  // whether or not the level file pads its edges with spaces.
  function buildAutomapBase() {
    explored = new Uint8Array(MW * MH);
    outline = new Uint8Array(MW * MH);
    exploreTile = -1; exploreTimer = 0;
    const walkableNear = (x, y) => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const tx = x + ox, ty = y + oy;
        if (tx >= 0 && ty >= 0 && tx < MW && ty < MH && tileKind[ty * MW + tx] !== TILE.WALL) return true;
      }
      return false;
    };
    const outside = new Uint8Array(MW * MH), stack = [];
    const seed = (x, y) => {
      const i = y * MW + x;
      if (!outside[i] && tileKind[i] === TILE.WALL && !walkableNear(x, y)) { outside[i] = 1; stack.push(i); }
    };
    for (let x = 0; x < MW; x++) { seed(x, 0); seed(x, MH - 1); }
    for (let y = 0; y < MH; y++) { seed(0, y); seed(MW - 1, y); }
    while (stack.length) {
      const i = stack.pop(), x = i % MW, y = (i - x) / MW;
      if (x > 0) seed(x - 1, y);
      if (x < MW - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1);
      if (y < MH - 1) seed(x, y + 1);
    }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, k = tileKind[i];
      if ((k !== TILE.WALL && k !== TILE.SECRET) || outside[i]) continue;
      for (let oy = -1; oy <= 1 && !outline[i]; oy++) for (let ox = -1; ox <= 1; ox++) {
        const tx = x + ox, ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || outside[ty * MW + tx]) { outline[i] = 1; break; }
      }
    }
  }

  // Marks everything the player can currently see. Every tile within the radius that has line of sight (the same
  // test enemies use: closed doors and walls block it) is explored; the 8 tiles around the player always are, and
  // so are the walls/doors touching a newly seen floor tile (a room's boundary, which grazing rays can miss).
  function updateExplored() {
    const R = AUTOMAP_REVEAL_RADIUS, ptx = Math.floor(px), pty = Math.floor(py);
    for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
      const tx = ptx + ox, ty = pty + oy;
      if (ox * ox + oy * oy > R * R || tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
      const idx = ty * MW + tx;
      if (explored[idx]) continue;
      if (Math.abs(ox) > 1 || Math.abs(oy) > 1) { if (!hasLineOfSight(px, py, tx + 0.5, ty + 0.5)) continue; }
      explored[idx] = 1;
      if (tileKind[idx] === TILE.WALL) continue;
      for (let ny = ty - 1; ny <= ty + 1; ny++) for (let nx = tx - 1; nx <= tx + 1; nx++) {
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const k = tileKind[ny * MW + nx];
        if (k === TILE.WALL || k === TILE.SECRET || k === TILE.DOOR) explored[ny * MW + nx] = 1;
      }
    }
  }

  // Called once per tick from updateGame(): re-scan when the player changes tile, or every few ticks.
  function exploreStep() {
    const t = Math.floor(py) * MW + Math.floor(px);
    if (t !== exploreTile || --exploreTimer <= 0) { exploreTile = t; exploreTimer = AUTOMAP_EXPLORE_TICKS; updateExplored(); }
  }

  function closeAutomap() {
    automapOpen = false;
    if (automapResume) setPaused(false);
  }
  function toggleAutomap() {
    if (automapOpen) { closeAutomap(); return; }
    automapResume = !paused;   // remember whether to unpause on close
    automapOpen = true;
    setPaused(true);
  }

  // Paints the automap over the whole `grid` (called at the end of renderFrame while automapOpen). Row 0 is a title,
  // the last row a legend, the rest the map. Each map tile gets a priority and a cell; when several tiles share a
  // screen cell (big levels, sx/sy > 1) the highest priority wins. When the level is narrow enough each tile is
  // drawn two characters wide so it is not squashed (terminal characters are about twice as tall as wide).
  function renderAutomap(grid) {
    for (let y = 0; y < H; y++) grid[y].fill(' ');
    const areaW = W - 2, areaH = H - 3;
    // A level that does not fit is shrunk by whole-tile blocks, sx tiles wide by sy tall. Characters are about twice as
    // tall as wide, so sy = 2 * sx keeps the map's real proportions (a 1:1 block would look stretched vertically).
    let sx = 1, sy = 1;
    if (MW > areaW || MH > areaH) { sx = Math.max(1, Math.ceil(MW / areaW), Math.ceil(MH / (areaH * 2))); sy = sx * 2; }
    const zx = (sx === 1 && sy === 1 && MW * 2 <= areaW) ? 2 : 1;
    const cols = Math.ceil(MW / sx), rows = Math.ceil(MH / sy);
    const ox = 1 + Math.floor((areaW - cols * zx) / 2), oy = 1 + Math.floor((areaH - rows) / 2);
    const pri = new Uint8Array(cols * rows), cell = new Array(cols * rows).fill(' ');
    const put = (x, y, p, c) => {
      const i = Math.floor(y / sy) * cols + Math.floor(x / sx);
      if (p >= pri[i]) { pri[i] = p; cell[i] = c; }
    };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const idx = y * MW + x, kind = tileKind[idx], seen = explored[idx] === 1;
      if (kind === TILE.EXIT) put(x, y, 90, '\x0BE');
      else if (kind === TILE.WALL || (kind === TILE.SECRET && blocked[idx])) {
        if (seen) put(x, y, 41, '\x04#'); else if (outline[idx]) put(x, y, 40, '\x07#');
      } else if (!seen) continue;
      else if (kind === TILE.DOOR) {
        const key = doorKey[idx];
        put(x, y, key ? 70 : 60, (key ? KEYS[key].tag : '\x0C') + (doorOpen[idx] ? '/' : key ? 'K' : 'D'));
      }
      else if (kind === TILE.HAZARD) put(x, y, 50, '\x10~');
      else put(x, y, 30, '·');
    }
    for (const it of pickups) {
      const def = PICKUPS[it.type];
      const tx = Math.floor(it.x), ty = Math.floor(it.y);
      if (it.alive && def && (!it.secret || explored[ty * MW + tx])) put(tx, ty, 80, def.glyph[0] + def.glyph[1]);
    }
    const angleNorm = ((pa % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    put(Math.floor(px), Math.floor(py), 100, '\x0A' + ['►', '▼', '◄', '▲'][Math.floor((angleNorm + Math.PI / 4) / (Math.PI / 2)) % 4]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, gx = ox + c * zx, gy = oy + r;
      if (gx < 0 || gx + zx > W || gy < 0 || gy >= H) continue;
      grid[gy][gx] = cell[i];
      if (zx === 2) grid[gy][gx + 1] = cell[i].endsWith('#') ? cell[i] : ' ';
    }
    const title = `AUTOMAP  -  ${LEVELS[levelIndex].name}  -  M TO CLOSE`;
    for (let i = 0; i < title.length && i < W; i++) grid[0][Math.max(0, Math.floor((W - title.length) / 2)) + i] = title[i];
    const legend = [['\x0A►', 'YOU'], ['\x0BE', 'EXIT'], ['\x0CD', 'DOOR'], ['\x18K', 'LOCKED'], ['\x17=', 'ITEM'], ['\x10~', 'HAZARD'], ['·', 'EXPLORED']];
    let lx = 1;
    for (const [c, label] of legend) {
      if (lx + label.length + 3 >= W) break;
      grid[H - 1][lx] = c; lx += 2;
      for (const ch of label) grid[H - 1][lx++] = ch;
      lx += 2;
    }
  }

  // Projects a world point onto the screen. Returns { screenX (column), dist (true distance), perp (distance along the
  // view direction), h (on-screen height in rows) } or null if it is too close (<0.3), beyond VIEW_DIST, or outside the
  // view (with 0.2 rad of slack so sprites don't pop at the edges). Used by renderFrame() for every sprite and by
  // hitEnemy() to place damage numbers.
  // The column formula (norm / FOV + 0.5) * W is the inverse of renderFrame()'s  rayAngle = pa + (x / W - 0.5) * FOV.
  // Both are linear in angle (not in tan(angle)); they must be changed together or sprites will slide against walls.
  function projectSprite(sx, sy) {
    const dx = sx - px, dy = sy - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > VIEW_DIST || dist < 0.3) return null;
    const angle = Math.atan2(dy, dx) - pa;
    const norm = (((angle + Math.PI) % TAU) + TAU) % TAU - Math.PI;  // JS % keeps the sign, so wrap twice
    if (Math.abs(norm) > FOV / 2 + 0.2) return null;
    const screenX = Math.round((norm / FOV + 0.5) * W);
    const perp = dist * Math.cos(norm);   // distance along the view direction (no fisheye)
    const h = Math.min(H, Math.round(H / perp * 2.4));
    return { screenX, dist, perp, h };
  }

  // ─── USE / INTERACT ─────────────────────────────────────────────────────────
  // The F key (edge-triggered with a 12-tick cooldown in updateGame). First checks for a usable decoration in front of you
  // (usableDecorAhead: the terminal opens the Bitburner overlay); otherwise probes the single tile 1.3 tiles straight ahead.
  // SECRET: becomes passable for good (blocked = 0) and counts as found. DOOR: needs the matching key in heldKeys if
  // doorKey says so; toggles the door's TARGET state (doorOpen); updateDoors() then animates it and updates `blocked`. Refuses to close on the player or a living
  // enemy. EXIT tiles are not "used": updateGame() ends the level when the player stands on one.
  // The usable decoration (DECORATIONS `use`) you are standing close to and facing, or null: within
  // TUNING.terminalRange tiles, inside about +/-0.6 rad of where you look, and with a clear line of sight.
  function usableDecorAhead() {
    let best = null, bestD = TUNING.terminalRange;
    for (const d of decor) {
      if (!DECORATIONS[d.type].use) continue;
      const dx = d.x - px, dy = d.y - py, dist = Math.hypot(dx, dy);
      if (dist < bestD && Math.abs(angleDiff(Math.atan2(dy, dx), pa)) < 0.6 && hasLineOfSight(px, py, d.x, d.y)) { best = d; bestD = dist; }
    }
    return best;
  }
  function tryUse() {
    const dec = usableDecorAhead();
    if (dec) { if (DECORATIONS[dec.type].use === 'terminal') openTerminal(); return; }
    const fx = px + Math.cos(pa) * 1.3, fy = py + Math.sin(pa) * 1.3;
    const mx = Math.floor(fx), my = Math.floor(fy);
    const idx = my * MW + mx;
    const kind = tileAt(fx, fy);

    if (kind === TILE.SECRET) {
      if (blocked[idx]) {
        blocked[idx] = 0;
        secretsFound++;
        flash('SECRET FOUND!', 40, 'secret');
        play(SOUNDS.door, 0.8);
      }
      return;
    }

    if (kind === TILE.DOOR) {
      const needs = doorKey[idx];
      if (needs && !heldKeys.has(needs)) { flash(`NEED ${KEYS[needs].name}!`, 25); return; }
      // Don't close a door on top of someone
      if (doorOpen[idx] && doorOccupied(mx, my)) { flash('DOOR BLOCKED', 20); return; }
      doorOpen[idx] ^= 1;
      if (doorOpen[idx]) { doorHold[idx] = TUNING.doorAutoCloseTicks; wakeBeyondDoor(mx, my); }   // def.wakeOnDoor enemies behind it come for you
      flash(doorOpen[idx] ? (needs ? 'KEY DOOR OPENED' : 'DOOR OPENED') : 'DOOR CLOSED', 25);
      play(SOUNDS.door, 0.8);
    }
  }

  // True if the player or a living enemy is in (or touching) door tile (mx, my): a door must not close on them.
  function doorOccupied(mx, my) {
    const near = (x, y) => Math.abs(x - (mx + 0.5)) < 0.75 && Math.abs(y - (my + 0.5)) < 0.75;
    return near(px, py) || enemies.some(e => e.alive && near(e.x, e.y));
  }

  // ─── WEAPONS IN USE ─────────────────────────────────────────────────────────
  // Weapon state is two variables: `owned` (Set of weapon ids) and `currentWeapon`. They change in three places:
  // collectPickup() (grants and selects a new weapon), switchWeapon() (number keys, from onKey) and autoSwitch()
  // (when firing with too little ammo). Ammo is per type: ammo[wpn.ammoType]. startLevel() resets all of this.
  const angleDiff = (a, b) => (((a - b + Math.PI) % TAU) + TAU) % TAU - Math.PI;   // a - b wrapped to -pi..pi
  const canFire = w => INFINITE_AMMO || !w.ammoType || w.ammoPerShot === 0 || ammo[w.ammoType] >= w.ammoPerShot;

  function switchWeapon(id) {
    if (!owned.has(id)) { flash(`NO ${WEAPONS[id].name} YET`, 12); return false; }
    currentWeapon = id;
    return true;
  }

  // Only triggers when the player TRIES to fire without enough ammo (shoot() calls it), not the moment ammo hits zero.
  // Picks the owned weapon with the highest `priority` that canFire(); priority 0 weapons (rocket launcher, BFG)
  // are never chosen automatically. With AUTO_SWITCH_EMPTY false it only shows OUT OF AMMO.
  // Out of ammo: pick the best owned weapon that can still fire (priority 0 weapons are never picked)
  function autoSwitch() {
    let best = null;
    if (AUTO_SWITCH_EMPTY) {
      for (const id of owned) {
        const w = WEAPONS[id];
        if (w.priority > 0 && canFire(w) && (!best || w.priority > WEAPONS[best].priority)) best = id;
      }
    }
    if (best) { currentWeapon = best; flash(`SWITCHED TO ${WEAPONS[best].name}`, 15); }
    else if (flashTimer <= 0) flash('OUT OF AMMO!', 15);
  }

  // ─── SHOOT ──────────────────────────────────────────────────────────────────
  // Flow: shoot() checks cooldown and ammo, then dispatches on wpn.fire to fireHitscan(), launchProjectile() or
  // swingMelee(). Hitscan and melee call hitEnemy() immediately. Projectiles are pushed onto `projectiles`, fly in
  // updateGame(), and call explode() when they reach a wall or an enemy, which calls hitEnemy() for the direct hit and
  // for splash victims. ALL damage to enemies, and therefore all kills and scoring, goes through hitEnemy().
  // Applies one hit to an enemy: damage, impact marker, hurt/death sound, score, damage number.
  // Caller must pass a LIVING enemy (it does not check e.alive). `impact` adds a small ASCII impact puff (HIT_BLOB) at
  // (hx, hy); there is no impact art for bullets. Damage can be fractional (splash
  // falloff); the displayed damage number is rounded and never below 1. Berserk doubles the damage here (so every
  // weapon benefits). A surviving enemy remembers where the shot came from and may flinch (def.painChance). Death sets alive=false and deathFrame=0, which
  // hands the corpse over to the death animation handling in updateGame().
  function hitEnemy(e, damage, hx, hy, impact = true) {
    const def = e.def;
    if (powers.berserk > 0) damage *= TUNING.berserkMultiplier;
    e.hp -= damage;
    e.memX = px; e.memY = py; e.memTicks = TUNING.alertMemoryTicks;   // being shot tells it where you are
    if (impact) effects.push({ x: hx, y: hy, ttl: 6, sprite: false, anim: 'impact', blob: HIT_BLOB });

    if (e.hp > 0) {
      if (def.sounds.hurt) playAt(def.sounds.hurt, e.x, e.y, 0.7);
      if (Math.random() < def.painChance) e.pain = TUNING.painTicks;
    } else {
      e.alive = false;   // stops the AI
      e.deathFrame = 0;  // starts the death animation
      if (!e.spawned && !def.prop) {   // summoned enemies and barrels give no kills or points (kill total stays fixed)
        kills++;
        score += def.points;
        flash(def.killMsg, 30, def.boss ? 'boss' : '');
      }
      if (def.sounds.death) playAt(def.sounds.death, e.x, e.y, 1.0);
    }

    const sp = projectSprite(e.x, e.y);
    if (sp) damageNumbers.push({ screenX: sp.screenX, screenY: Math.floor((H - sp.h) / 2) - 1, val: damage, ttl: 20 });
  }

  // Each pellet marches from the player in 0.15-tile steps for at most 100 steps (15 tiles), stopping at the first
  // wall or at the first living enemy whose square hitbox contains the point. Spread is a uniform random angle. There
  // is no per-pellet damage falloff.
  function fireHitscan(wpn) {
    for (let p = 0; p < wpn.pellets; p++) {
      const spreadAngle = pa + (Math.random() - 0.5) * wpn.spread;
      const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
      let rx = px, ry = py;
      for (let i = 0; i < 100; i++) {
        rx += dx * 0.15; ry += dy * 0.15;
        if (solidAt(rx, ry)) break;

        let target = null;
        for (const e of enemies) {
          if (!e.alive) continue;
          const r = e.def.hitbox;
          if (Math.abs(e.x - rx) < r && Math.abs(e.y - ry) < r) { target = e; break; }
        }
        if (target) { hitEnemy(target, wpn.damage, rx, ry); break; }
      }
    }
  }

  // Rockets, plasma bolts and BFG balls: they fly (see updateGame) and blow up in explode()
  // The shot goes onto the shared `projectiles` array with owner 'player'. Flight, wall/enemy collision and the call to
  // explode() are in updateGame()'s projectile loop, not here.
  function launchProjectile(wpn) {
    const def = PROJECTILES[wpn.projectile];
    if (!def) return;
    const a = pa + (wpn.spread ? (Math.random() - 0.5) * wpn.spread : 0);
    const cos = Math.cos(a), sin = Math.sin(a);
    const clear = !solidAt(px + cos * 0.4, py + sin * 0.4);   // can't start inside a wall
    projectiles.push({
      owner: 'player', type: wpn.projectile,
      x: clear ? px + cos * 0.4 : px, y: clear ? py + sin * 0.4 : py,
      dx: cos * def.speed, dy: sin * def.speed,
      alive: true, damage: wpn.damage ?? def.damage, bypassArmor: false,
    });
  }

  // A player projectile goes off at (x, y). `directHit` is the enemy it struck, if any.
  // Splash damage falls off linearly with distance and requires line of sight from the blast to the victim. The
  // player is only hurt if the projectile's splash has hurtsPlayer (rockets: yes, BFG: no). A projectile that hits a
  // wall explodes at its last free position, so the blast is in front of the wall.
  function explode(p, x, y, directHit) {
    const def = PROJECTILES[p.type];
    p.alive = false;
    if (directHit) hitEnemy(directHit, p.damage, x, y, false);
    const sp = def.splash;
    if (sp) {
      for (const e of enemies) {
        if (!e.alive || e === directHit) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d >= sp.radius || !hasLineOfSight(x, y, e.x, e.y)) continue;
        hitEnemy(e, sp.damage * (1 - d / sp.radius), e.x, e.y, false);
      }
      if (sp.hurtsPlayer) {
        const d = Math.hypot(px - x, py - y);
        if (d < sp.radius && hasLineOfSight(x, y, px, py)) hurtPlayer(sp.damage * (1 - d / sp.radius), 'EXPLOSION!', { volume: 0.8 });
      }
    }
    if (def.explosion) effects.push({ x, y, ttl: def.explosion.ttl, sprite: false, anim: 'impact', blob: def.explosion });
    if (def.explosionSound) playAt(def.explosionSound, x, y, 1.0);
  }

  // Chainsaw: hits the nearest enemy in front of you, if one is close enough
  function swingMelee(wpn) {
    let target = null, best = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - px, dy = e.y - py, d = Math.hypot(dx, dy);
      if (d > wpn.range + e.def.hitbox * 0.5 || d >= best) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), pa)) > wpn.arc) continue;
      if (!hasLineOfSight(px, py, e.x, e.y)) continue;
      target = e; best = d;
    }
    play(target ? (wpn.hitSound ?? wpn.sound) : wpn.sound, wpn.volume);
    if (target) hitEnemy(target, wpn.damage, target.x, target.y);
  }

  // Called every tick while Space or the left mouse button is held. Order: cooldown gate -> ammo check (autoSwitch when short) -> pay ammo
  // -> start cooldown and muzzle flash -> dispatch on wpn.fire. Cooldowns and flash counters tick down in updateGame().
  function shoot() {
    const wpn = WEAPONS[currentWeapon];
    if (shootCooldown > 0) return;
    if (!canFire(wpn)) { autoSwitch(); return; }
    if (!INFINITE_AMMO && wpn.ammoType) ammo[wpn.ammoType] -= wpn.ammoPerShot;
    shootCooldown = wpn.cooldown;
    muzzleFlash = wpn.flash;
    afterglow = wpn.afterglow;
    alertEnemies(px, py, wpn.noise);   // gunfire wakes nearby enemies

    if (wpn.fire === 'melee') {
      swingMelee(wpn);
    } else {
      play(wpn.sound, wpn.volume);
      if (wpn.fire === 'projectile') launchProjectile(wpn);
      else fireHitscan(wpn);
    }
    updateHud();
  }

  // Draws a filled ellipse of characters (rocket, plasma bolt, explosions) centred on screen column screenX.
  // blob.chars runs from the centre outward. Columns hidden behind walls are skipped.
  const COLS_PER_TILE = W / (2 * Math.tan(FOV / 2));
  const MAX_BLOB_COLS = 60;
  // ASCII fallback for things in the air (rockets, plasma, explosions). Writes colour-tagged cells straight into
  // `grid`, so it must be called while renderFrame() is still assembling the grid (before the crosshair and gun are
  // drawn on top). Each column is hidden individually when a wall is nearer than `dist`.
  function drawBlob(grid, wallDist, screenX, dist, perp, blob) {
    const cols = Math.max(1, Math.min(MAX_BLOB_COLS, Math.round(blob.size * COLS_PER_TILE / perp)));
    const rows = Math.max(1, Math.min(H - 2, Math.round(cols / 2)));   // characters are about twice as tall as wide
    const rx = cols / 2, ry = rows / 2, cy = Math.floor(H / 2);
    for (let r = 0; r < rows; r++) {
      const gy = cy - Math.floor(rows / 2) + r;
      if (gy < 0 || gy >= H) continue;
      for (let c = 0; c < cols; c++) {
        const gx = screenX - Math.floor(cols / 2) + c;
        if (gx < 0 || gx >= W || wallDist[gx] < dist - 0.1) continue;
        const nx = (c + 0.5 - rx) / rx, ny = (r + 0.5 - ry) / ry;
        const rr = Math.sqrt(nx * nx + ny * ny);
        if (rr > 1) continue;
        grid[gy][gx] = blob.tag + blob.chars[Math.min(blob.chars.length - 1, Math.floor(rr * blob.chars.length))];
      }
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  // The cell for one floor/ceiling position: screen row y of a column whose ray has direction (fcos, fsin).
  // invCos = 1/cos(angle from view centre) turns the row's perpendicular distance into distance along the ray.
  // The world point under the cell gives a checker parity (so the floor visibly moves as you walk) and lets
  // nukage tiles show up on the floor. Beyond VIEW_DIST nothing is drawn.
  function floorCell(y, fcos, fsin, invCos) {
    const perp = FLOOR_PERP[y];
    if (perp > VIEW_DIST) return ' ';
    const t = perp * invCos;
    const wx = px + fcos * t, wy = py + fsin * t;
    const parity = (Math.floor(wx) + Math.floor(wy)) & 1;
    if (y < H / 2) return perp < 10 && parity ? '\x0F-' : ' ';                       // ceiling
    if (tileAt(wx, wy) === TILE.HAZARD) return perp < 12 ? (parity ? '\x10~' : '\x10-') : '\x10.';
    if (perp < 4) return parity ? ',' : '.';
    return perp < 9 ? '.' : '·';
  }
  // ─── FLATS (sky ceiling + textured floor) ───────────────────────────────────
  // Optional pictures for the ceiling and floor, from two entries in sprites.json:
  //   Floor_idle1    tileable square picture, one copy per map tile. Drawn with real perspective, so it slides past
  //                  as you walk, and it fades into darkness with distance. Shrunk to FLAT_TEX x FLAT_TEX when loaded.
  //   Ceiling_idle1  the same for the ceiling (indoor levels). Takes priority over the sky.
  //   Sky_idle1      wide panorama (wraps all the way round, so it must tile sideways), used on the ceiling when there is
  //                  no Ceiling_idle1 (outdoor look). Scrolls as you turn, does not move when you walk.
  // Any of them may be missing (a missing ceiling/floor is drawn dark); with none, or with TUNING.floorAndCeiling false,
  // the old ASCII floor is used. Nukage tiles are painted as a flickering green on the same layer.
  // How: a canvas of FLAT_W x FLAT_H pixels (FLAT_SX x FLAT_SY pixels per text cell) sits UNDER the text. paintFlats()
  // fills it each frame: wall rows black (so the text walls stay solid), ceiling rows from the sky, floor rows from the
  // texture (world point = the same maths as floorCell). The ASCII layer leaves those cells blank.
  const FLAT_SX = 4, FLAT_SY = 8, FLAT_W = W * FLAT_SX, FLAT_H = H * FLAT_SY, FLAT_TEX = 64;
  let flatCtx = null, flatImage = null, skyPix = null, skyW = 0, skyH = 0, floorPix = null, ceilPix = null;
  const flatCos = new Float32Array(FLAT_W), flatSin = new Float32Array(FLAT_W), flatInv = new Float32Array(FLAT_W), skyCol = new Int32Array(FLAT_W);
  const flatPerp = new Float32Array(FLAT_H), flatShade = new Float32Array(FLAT_H), skyRow = new Int32Array(FLAT_H);
  for (let r = 0; r < FLAT_H; r++) {
    const yc = (r + 0.5) * H / FLAT_H;
    skyRow[r] = r;   // set properly in buildFlats (needs the sky height)
    if (yc !== H / 2) {
      flatPerp[r] = H / (0.82 * (2 * (yc > H / 2 ? yc : H - yc) - H));    // same formula as FLOOR_PERP, at pixel precision (ceiling mirrors the floor)
      flatShade[r] = 1.25 / (1 + flatPerp[r] * 0.25);
    }
  }
  // Reads the picture's pixels (RGBA bytes) at width x height, or null
  function pixelsOf(img, width, height) {
    const c = doc.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, width, height);
    return g.getImageData(0, 0, width, height).data;
  }
  // Called once after preloadSprites(). Needs canvas support; any failure just leaves the ASCII floor in use.
  function buildFlats() {
    try {
      const sky = framesFor('SKY', 'idle')?.[0], floor = framesFor('FLOOR', 'idle')?.[0], ceil = framesFor('CEILING', 'idle')?.[0];
      if (!sky && !floor && !ceil) return;
      flatCtx = flatCanvas.getContext('2d');
      flatCanvas.width = FLAT_W; flatCanvas.height = FLAT_H;
      flatImage = flatCtx.createImageData(FLAT_W, FLAT_H);
      if (sky) {
        skyW = sky.width; skyH = sky.height; skyPix = pixelsOf(sky, skyW, skyH);
        for (let r = 0; r < FLAT_H / 2; r++) skyRow[r] = Math.min(skyH - 1, Math.floor(r / (FLAT_H / 2) * skyH * 0.8));   // the top 80% of the picture fills the ceiling
      }
      if (floor) floorPix = pixelsOf(floor, FLAT_TEX, FLAT_TEX);
      if (ceil) ceilPix = pixelsOf(ceil, FLAT_TEX, FLAT_TEX);
    } catch (e) {
      flatCtx = null;
      ns.tprint(`WARNING: textured floor/sky disabled: ${e}`);
    }
  }
  // Paints the floor/sky layer for the current view. Returns false when there is no layer (the caller then draws ASCII).
  function paintFlats() {
    if (!flatCtx) return false;
    const d = flatImage.data, hazardPhase = (Date.now() >> 8) & 1, FW = FLAT_W, HALF = FLAT_H / 2, MASK = FLAT_TEX - 1;
    for (let c = 0; c < FW; c++) {
      const cx = (c + 0.5) / FW * W;
      const ang = pa + (cx / W - 0.5) * FOV;
      flatCos[c] = Math.cos(ang); flatSin[c] = Math.sin(ang); flatInv[c] = 1 / Math.cos(ang - pa);
      skyCol[c] = skyPix ? Math.floor((((ang / TAU) % 1) + 1) % 1 * skyW) : 0;
      // Rows covered by the wall in this text column are painted black so the wall characters have a solid backing
      const wx = Math.min(W - 1, Math.floor(cx));
      const top = Math.max(0, Math.floor((H - frameWallH[wx]) / 2)) * FLAT_SY, bottom = Math.min(H, Math.floor((H - frameWallH[wx]) / 2) + frameWallH[wx]) * FLAT_SY;
      for (let r = 0; r < FLAT_H; r++) {
        const o = (r * FW + c) * 4;
        let R = 0, G = 0, B = 0;
        if (r >= top && r < bottom) { /* wall: black */ }
        else if (r < HALF && ceilPix) {
          const perp = flatPerp[r];
          if (perp < VIEW_DIST) {
            const t = perp * flatInv[c], sh = Math.min(1, flatShade[r]);
            const i = ((Math.floor((py + flatSin[c] * t) * FLAT_TEX) & MASK) * FLAT_TEX + (Math.floor((px + flatCos[c] * t) * FLAT_TEX) & MASK)) * 4;
            R = ceilPix[i] * sh; G = ceilPix[i + 1] * sh; B = ceilPix[i + 2] * sh;
          }
        } else if (r < HALF) {
          if (skyPix) { const i = (skyRow[r] * skyW + skyCol[c]) * 4; R = skyPix[i]; G = skyPix[i + 1]; B = skyPix[i + 2]; }
          else { R = 18; G = 14; B = 22; }
        } else {
          const perp = flatPerp[r];
          if (perp < VIEW_DIST) {
            const t = perp * flatInv[c], fx = px + flatCos[c] * t, fy = py + flatSin[c] * t, sh = Math.min(1, flatShade[r]);
            const tx = Math.floor(fx * FLAT_TEX) & MASK, ty = Math.floor(fy * FLAT_TEX) & MASK;
            if (tileAt(fx, fy) === TILE.HAZARD) {   // nukage: flickering green blocks
              const k = (((tx >> 3) ^ (ty >> 3) ^ hazardPhase) & 1) ? 150 : 100;
              G = k * sh; B = 25 * sh;
            } else if (floorPix) {
              const i = (ty * FLAT_TEX + tx) * 4;
              R = floorPix[i] * sh; G = floorPix[i + 1] * sh; B = floorPix[i + 2] * sh;
            } else { const k = (((tx >> 5) + (ty >> 5)) & 1) ? 45 : 30; R = G = B = k * sh; }
          }
        }
        d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
      }
    }
    flatCtx.putImageData(flatImage, 0, 0);
    return true;
  }

  // Draws one frame. Reads the whole game state, writes nothing back except the per-frame arrays. Output goes to
  // three places: pre.innerHTML (the ASCII frame, plus the flash message appended afterwards), spriteOverlay (rebuilt
  // from scratch with cloned PNG Images) and the shared frame arrays.
  // `grid[y][x]` is the working frame; each cell is a single glyph or a colour tag char followed by a glyph
  // (see CELL_COLORS). Painting order is deliberate, later steps overwrite earlier ones:
  //   1. castRay per column -> frame arrays          4. crosshair + muzzle flash
  //   2. walls + floor/ceiling (floorCell)         5. damage numbers, then weapon art
  //   3. sprites: sorted far->near, ASCII fallbacks   6. minimap (if Tab), automap (if open: replaces
  //      all of 1-6), then html string -> pre.innerHTML
  //      into grid, PNGs into the overlay             7. flash message div
  function renderFrame() {
    const wallDist = frameWallDist, wallPerp = frameWallPerp, wallH = frameWallH;
    const wallSide = frameWallSide, wallTile = frameWallTile, wallIdx = frameWallIdx;

    for (let x = 0; x < W; x++) {
      // Rays are spaced linearly in angle across the FOV (see the matching note on projectSprite). `t` is the true
      // distance; `perp` removes the fisheye and is used for height and shading. 100 means no wall in range, which
      // yields a wall height of about 0, so that column is just empty.
      const rayAngle = pa + (x / W - 0.5) * FOV;
      const t = castRay(rayAngle);
      wallDist[x] = t;
      // Height from the perpendicular distance, so flat walls look flat instead of bowing outward
      const perp = t * Math.cos(rayAngle - pa);
      wallPerp[x] = perp;
      wallH[x] = Math.min(H + 12, Math.round(H / (perp * 0.82)));
      if (t < 100) {
        wallSide[x] = hitSide;
        wallTile[x] = tileAt(hitTX + 0.5, hitTY + 0.5);   // exact tile: door / secret / plain wall
        wallIdx[x] = hitTY * MW + hitTX;
      } else {
        wallTile[x] = TILE.WALL; wallIdx[x] = 0;   // nothing hit: don't keep last frame's (or last level's) tile
      }
    }

    const grid = [];
    for (let y = 0; y < H; y++) grid[y] = new Array(W).fill(' ');

    // Floor/sky picture layer (FLATS); when it is on, floor and ceiling cells are left blank so it shows through
    const flatsOn = TUNING.floorAndCeiling && paintFlats();
    flatCanvas.style.display = flatsOn ? 'block' : 'none';

    // Walls + floor/ceiling
    for (let x = 0; x < W; x++) {
      const h = wallH[x], d = wallPerp[x];
      const top = Math.max(0, Math.floor((H - h) / 2));
      // Same ramp as before, but north/south faces are one step darker than east/west faces
      const base = d < 2.2 ? 1 : Math.floor(d * 1.45);
      const shadeIndex = Math.max(0, Math.min(SHADES.length - 2, base + wallSide[x]));
      const isDoor = wallTile[x] === TILE.DOOR;
      const isSecret = wallTile[x] === TILE.SECRET;
      const keyId = isDoor ? doorKey[wallIdx[x]] : undefined;
      const doorTag = keyId ? KEYS[keyId].tag : '\x0C';   // key doors take the colour of their key
      const styleCells = WALL_CELLS[wallStyle[wallIdx[x]] | 0] ?? WALL_CELLS[0];
      // A door that is opening/closing is drawn shorter (it "rises"); the rows it vacates are left dark
      const dp = isDoor ? doorPos[wallIdx[x]] : 0;
      const doorRows = dp > 0 ? Math.round(h * (1 - dp * 1.6)) : h;
      // Floor/ceiling need this column's ray direction (the same angle castRay used)
      const colAngle = pa + (x / W - 0.5) * FOV;
      const fcos = Math.cos(colAngle), fsin = Math.sin(colAngle), invCos = 1 / Math.cos(colAngle - pa);

      for (let y = 0; y < H; y++) {
        if (y < top || y >= top + h) {
          grid[y][x] = TUNING.floorAndCeiling && !flatsOn ? floorCell(y, fcos, fsin, invCos) : ' ';
        }
        else {
          if (isDoor) {
            grid[y][x] = y >= top + doorRows ? ' ' : doorTag + (dp > 0 ? ':' : d < 2.5 ? '+' : '|');
          } else if (isSecret) {
            grid[y][x] = d < 2.2 ? '#' : SHADES[Math.max(0, shadeIndex - 1)];
          } else {
            grid[y][x] = styleCells[shadeIndex];
          }
        }
      }
    }
    // ── Sprites ─────────────────────────────────────────────────────────────
    // Enemies, pickups, projectiles and impact flashes all become the same kind of record and share one
    // draw path. Fields: type (sprite type), anim, ms (ms per frame) or step (fixed frame), scale, glyph
    // (ASCII fallback for floor items), blob (ASCII fallback for things in the air), fall/fallT (death sinking).
    const now = Date.now();
    const sprites = [];
    const addSprite = (x, y, spec) => {
      const s = projectSprite(x, y);
      if (s && hasLineOfSight(px, py, x, y)) sprites.push({ s, ...spec });
    };

    for (const e of enemies) {
      const def = e.def;
      if (e.deathFrame >= 0) {
        // Enemies with render.corpse = false vanish once their death animation has played
        const nDie = framesFor(e.type, 'die')?.length || 1;
        if (!def.render.corpse && e.deathFrame >= nDie * 2) continue;
        addSprite(e.x, e.y, {
          type: e.type, anim: 'die', step: Math.floor(e.deathFrame / 2), scale: def.render.scale,
          fall: def.render.fall, fallT: Math.min(e.deathFrame / 16, 1),   // flying corpses sink over the first 16 ticks
          ground: !def.render.float
        });
      } else if (e.alive) {
        addSprite(e.x, e.y, e.isAttacking
          ? { type: e.type, anim: 'attack', ms: def.anim.attack, scale: def.render.scale, blob: def.blob, ground: !def.render.float }
          : { type: e.type, anim: 'walk', ms: def.anim.walk, scale: def.render.scale, blob: def.blob, ground: !def.render.float });
      }
    }
    for (const p of pickups) {
      const def = PICKUPS[p.type];
      if (p.alive && def) addSprite(p.x, p.y, { type: def.sprite ?? p.type.toUpperCase(), anim: 'idle', step: 0, scale: 1, glyph: def.glyph });
    }
    for (const d of decor) {
      const def = DECORATIONS[d.type];
      // def.anim = ms per frame -> loop the idle frames (offset desynchronises copies); otherwise show frame 1 only
      addSprite(d.x, d.y, { type: d.type, anim: 'idle', step: def.anim ? undefined : 0, ms: def.anim, offset: d.phase, scale: def.scale ?? 1,
        glyph: def.glyph, blob: def.blob, hang: !!def.hang, ground: !def.hang && !def.float });
    }
    for (const p of projectiles) {
      if (!p.alive) continue;
      const d = PROJECTILES[p.type];
      addSprite(p.x, p.y, { type: d.sprite || false, anim: 'idle', step: 0, scale: d.scale ?? 1, blob: d.blob });
    }
    // Effect pictures: fx.cycle flips through that many frames (every 3 ticks); fx.n with fx.tpf plays n frames once, tpf ticks
    // each (explosions, smoke, multi-frame impacts); fx.tumble loops n frames while the piece is still moving and then rests on
    // the last one (thrown gun parts). fx.ground stands the picture on the floor; fx.scale sizes it.
    const fxStep = fx => fx.tumble ? ((fx.vx || fx.vy) ? Math.floor(fx.age / 3) % fx.n : fx.n - 1)
      : fx.n ? Math.min(fx.n - 1, Math.floor(fx.age / fx.tpf)) : fx.cycle ? Math.floor(fx.ttl / 3) % fx.cycle : 0;
    for (const fx of effects) addSprite(fx.x, fx.y, { type: fx.sprite, anim: fx.anim, step: fxStep(fx), scale: fx.scale ?? 1, ground: !!fx.ground, blob: fx.blob });
    sprites.sort((a, b) => b.s.dist - a.s.dist);

    // ── PNG Sprites ───────────────────────────────────────────────────────────
    // The overlay is cleared and rebuilt every frame. PNG scale is 5 / perp times a per-type factor, clamped to 0.1-1.0
    // (image pixels, not characters), centred on the horizon line of the wall height at that distance. Sprites are
    // hidden when the wall at their CENTRE column is nearer, so a wide sprite can poke out past a wall edge.
    // Z-order among sprites follows distance (z-index 100 - dist).
    spriteOverlay.textContent = '';
    // Read layout once per frame (reading it inside the loop forces a reflow per sprite)
    const charWidth = renderContainer.clientWidth / W;
    const charHeight = renderContainer.clientHeight / H;

    for (const { s, type, anim, ms, step, offset, scale: baseScale, glyph, blob, fall, fallT, hang, ground } of sprites) {
      const { screenX, dist, perp, h } = s;

      // Skip sprites hidden behind a wall at their screen column
      if (screenX >= 0 && screenX < W && wallDist[screenX] < dist - 0.1) continue;

      const frames = framesFor(type, anim);
      if (!frames) {
        // No PNG art: floor items fall back to a coloured glyph, things in the air to an ASCII blob
        if (glyph && screenX >= 0 && screenX < W) {
          const wh = Math.min(H + 12, Math.round(H / (perp * 0.82)));
          const row = Math.max(0, Math.min(H - 1, Math.floor((H - wh) / 2) + wh - 1));
          grid[row][screenX] = glyph[0] + glyph[1];
        } else if (blob) {
          drawBlob(grid, wallDist, screenX, dist, perp, blob);
        }
        continue;
      }
      const img = frames[step != null ? Math.min(step, frames.length - 1) : Math.floor((now + (offset || 0)) / ms) % frames.length];
      if (!img) continue;

      // Scale sprite based on distance (closer = larger); big enemies use render.scale
      const scale = Math.max(0.1, Math.min(1.0, baseScale * 5.0 / perp));
      const imgW = img.width * scale;
      const imgH = img.height * scale;

      const pixelX = screenX * charWidth;
      const wallCenterY = (Math.floor((H - h) / 2) + h / 2) * charHeight;
      const deathFallOffset = fallT && !ground ? fallT * fall * imgH : 0;   // only flyers sink; grounded corpses stay on the floor
      // Ceiling hangers: top edge at the top of the wall (kept on screen when you stand right under it)
      const wallTopY = Math.max(0, Math.floor((H - h) / 2) * charHeight);
      // Grounded decorations: bottom edge on the floor line (the bottom of the wall at that distance, kept on screen)
      const wallBottomY = Math.min(H * charHeight, (Math.floor((H - h) / 2) + h) * charHeight);
      const pixelY = hang ? wallTopY : ground ? wallBottomY - imgH : wallCenterY - imgH / 2 + deathFallOffset;

      // Clone the already-decoded image instead of re-encoding it through a canvas every frame
      const spriteEl = img.cloneNode(false);
      spriteEl.draggable = false;
      spriteEl.style.cssText = `position:absolute;left:${pixelX - imgW / 2}px;top:${pixelY}px;` +
        `width:${imgW}px;height:${imgH}px;image-rendering:pixelated;z-index:${100 - Math.floor(dist)};`;
      spriteOverlay.appendChild(spriteEl);
    }

    // ── Crosshair + muzzle flash ────────────────────────────────────────────
    const cy = Math.floor(H / 2), cx = Math.floor(W / 2);
    grid[cy][cx] = '\x01+';
    if (muzzleFlash > 0 || afterglow > 0) {
      grid[cy - 1][cx] = '\x03*';
      if (cx + 1 < W) grid[cy - 1][cx + 1] = '\x03*';
      if (cx - 1 >= 0) grid[cy - 1][cx - 1] = '\x03*';
      if (muzzleFlash > 2) {
        // Bright muzzle bloom
        if (cy + 1 < H) grid[cy + 1][cx] = '\x03*';
        grid[cy][cx - 1] = '\x03-';
        if (cx + 1 < W) grid[cy][cx + 1] = '\x03-';
      }
    }

    // ── Damage numbers ──────────────────────────────────────────────────────
    for (const dn of damageNumbers) {
      if (dn.ttl <= 0) continue;
      const gx = Math.floor(dn.screenX), gy = Math.max(0, dn.screenY - Math.floor((20 - dn.ttl) * 0.3));
      const digits = String(Math.max(1, Math.round(dn.val)));   // one cell per digit so rows stay aligned
      for (let i = 0; i < digits.length; i++) {
        if (gx + i >= 0 && gx + i < W && gy >= 0 && gy < H) grid[gy][gx + i] = '\x11' + digits[i];
      }
    }

    // ── Weapon sprite ───────────────────────────────────────
    const wpn = WEAPONS[currentWeapon];
    const gunSprite = shootCooldown > wpn.cooldown * 0.6 ? wpn.art.fire : wpn.art.idle;
    const gunY = H - gunSprite.length;
    const gunX = Math.floor(W / 2) - 3;
    for (let gy = 0; gy < gunSprite.length; gy++) {
      for (let gx = 0; gx < gunSprite[gy].length; gx++) {
        const ch = gunSprite[gy][gx];
        if (ch !== ' ' && gunX + gx >= 0 && gunX + gx < W && gunY + gy >= 0 && gunY + gy < H) {
          grid[gunY + gy][gunX + gx] = '\x12' + ch;
        }
      }
    }

    // ── Minimap ─────────────────────────────────────────────────────────────
    if (showMap) {
      const viewW = 20, viewH = 16; // minimap window size in map tiles
      const mapStartX = W - viewW - 2;
      const mapStartY = 1;

      // Center the view on the player
      const camX = Math.floor(px) - Math.floor(viewW / 2);
      const camY = Math.floor(py) - Math.floor(viewH / 2);

      for (let vy = 0; vy < viewH; vy++) {
        for (let vx = 0; vx < viewW; vx++) {
          const mx = camX + vx, my = camY + vy;
          const gx = mapStartX + vx, gy = mapStartY + vy;
          if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

          if (mx < 0 || my < 0 || mx >= MW || my >= MH) {
            grid[gy][gx] = '\x07#'; continue;
          }

          const idx = my * MW + mx, kind = tileKind[idx];
          let ch = ' ', colorTag = '\x07';
          if (kind === TILE.WALL) ch = '#';
          else if (kind === TILE.SECRET) ch = blocked[idx] ? '#' : ' ';   // looks like a wall until found
          else if (kind === TILE.DOOR) {
            const key = doorKey[idx];
            ch = doorOpen[idx] ? '/' : key ? 'K' : '+';
            if (key) colorTag = KEYS[key].tag;
          }
          else if (kind === TILE.EXIT) { ch = 'E'; colorTag = '\x0B'; }
          else if (kind === TILE.HAZARD) { ch = '~'; colorTag = '\x10'; }
          grid[gy][gx] = colorTag + ch;
        }
      }

      // Pickups that are still lying around
      for (const p of pickups) {
        const def = PICKUPS[p.type];
        const gx = mapStartX + Math.floor(p.x) - camX, gy = mapStartY + Math.floor(p.y) - camY;
        if (p.alive && def && gx >= mapStartX && gx < mapStartX + viewW && gy >= mapStartY && gy < mapStartY + viewH) {
          grid[gy][gx] = def.glyph[0] + '.';
        }
      }

      // Player dot at center
      const pgx = mapStartX + Math.floor(viewW / 2);
      const pgy = mapStartY + Math.floor(viewH / 2);
      if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) {
        const angleNorm = ((pa % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const dirs = ['►', '▼', '◄', '▲'];
        const dir = Math.floor((angleNorm + Math.PI / 4) / (Math.PI / 2)) % 4;
        grid[pgy][pgx] = '\x0A' + dirs[dir];
      }
    }

    // Full-screen automap replaces everything drawn so far (the PNG overlay is cleared too)
    if (automapOpen) { renderAutomap(grid); spriteOverlay.textContent = ''; flatCanvas.style.display = 'none'; }

    // ── Draw to DOM ─────────────────────────────────────────────────────────
    // Build one HTML string (merging runs of same-coloured cells into a single <span>) and
    // assign it once, instead of creating ~2000 DOM nodes every frame.
    let html = '';
    for (let y = 0; y < H; y++) {
      let runColor = null, run = '';
      for (let x = 0; x < W; x++) {
        const [color, text] = decodeCell(grid[y][x] || ' ');
        if (color !== runColor) {
          html += wrapRun(run, runColor);
          run = '';
          runColor = color;
        }
        run += escapeHtml(text);
      }
      html += wrapRun(run, runColor) + '\n';
    }
    pre.innerHTML = html;

    // Flash message
    if (flashTimer > 0 && flashMsg) {
      const msg = doc.createElement('div');
      const st = FLASH_STYLES[flashStyle] ?? FLASH_STYLES[''];
      msg.style.cssText = `position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);
        color:${st.color};
        font-size:${st.size};font-weight:bold;pointer-events:none;
        text-shadow:0 0 8px currentColor;`;
      msg.textContent = flashMsg;
      pre.appendChild(msg);
    }
  }

  // Grid cells are either a plain glyph or "<colour tag char><glyph>"
  // Colour tags: a tag is a control character placed in front of a glyph. Every tag used anywhere (KEYS[].tag, PICKUPS
  // glyph[0], PROJECTILES blob.tag, the literals in renderFrame) must have an entry here, or its colour is silently lost
  // and the tag character leaks into the HTML. Keep tags unique per meaning. \x05, \x06, \x09 and \x1F are currently unused.
  // decodeCell() also colours the floor characters in FLOOR_CHARS and the middle dot grey without a tag.
  // The glyph after a tag must be one UTF-16 unit because decodeCell() uses slice(1).
  const CELL_COLORS = {
    '\x01': '#ff0',  // crosshair
    '\x02': '#f6f',  // power-up pickups
    '\x0E': '#6af',  // tech wall
    '\x0F': '#334',  // ceiling
    '\x10': '#3d3',  // nukage floor
    '\x1A': '#c63',  // brick wall
    '\x03': '#ff0',  // muzzle flash
    '\x07': '#555',  // minimap wall / automap outline
    '\x04': '#99b',  // automap: explored wall
    '\x08': '#88f',  // blue door / key
    '\x0A': '#0f0',  // player arrow
    '\x0B': '#ff0',  // exit
    '\x0C': '#888',  // door
    '\x11': '#ff4',  // damage number
    '\x12': '#888',  // gun sprite
    '\x13': '#0ff',  // secret on map
    '\x14': '#fff',  // wall
    '\x15': '#f55',  // health pickup
    '\x16': '#5af',  // armor pickup
    '\x17': '#fd4',  // ammo pickup
    '\x18': '#f44',  // red key / red door
    '\x19': '#fd0',  // yellow key / yellow door
    '\x1B': '#fa0',  // explosion
    '\x1C': '#4cf',  // plasma
    '\x1D': '#4f4',  // BFG
    '\x1E': '#ddd',  // rocket / weapon pickups
  };
  function decodeCell(ch) {
    if (ch === ' ') return [null, ' '];
    const tagColor = CELL_COLORS[ch[0]];
    if (tagColor) return [tagColor, ch.slice(1)];
    if (ch === '\u00b7') return ['#333', ch];
    if (FLOOR_CHARS.includes(ch)) return ['#444', ch];
    return [null, ch];
  }
  const escapeHtml = s => s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
  const wrapRun = (run, color) => (!run ? '' : color ? `<span style="color:${color}">${run}</span>` : run);

  // ─── TITLE SCREEN ───────────────────────────────────────────────────────────
  // The title and end screens bypass renderFrame(): they build <pre> content from DOM nodes (spans per coloured line)
  // and are centred with center(). The title is redrawn every 50 ms only to animate the blinking prompt.
  const LOGO = [
    "\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557",
    "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551",
    "\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551",
    "\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255a\u2588\u2588\u2554\u255d\u2588\u2588\u2551",
    "\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551 \u255a\u2550\u255d \u2588\u2588\u2551",
    "\u255a\u2550\u2550\u2550\u2550\u2550\u255d  \u255a\u2550\u2550\u2550\u2550\u2550\u255d  \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u255d     \u255a\u2550\u255d",
  ];
  function center(s) {
    const visLen = [...s].length;
    return ' '.repeat(Math.max(0, Math.floor((W - visLen) / 2))) + s;
  }

  const TITLE_LINES = [
    ['', null], ['', null],
    ...LOGO.map(l => [l, '#c00']),

    ['', null],
    ['░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░', '#600'],
    ['░        BITBURNER EDITION        ░', '#600'],
    ['░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░', '#600'],
    ['', null],
    ['/\\                                      /\\', '#933'],
    ['/  \\ The UAC facility has been overrun. /  \\', '#933'],
    ['/_/\\_\\           RIP AND TEAR.          /_/\\_\\', '#933'],
    ['', null],
    ['>>>  PRESS ENTER TO BEGIN  <<<', 'BLINK'],
    ['', null],
    ['@DIFFICULTY', '#ca0'],
    ['', null],
    ['WASD Move  Q/E Strafe  F Use  SPACE/Click Shoot  1-7 Weapons  Tab Mini  M Map  Mouse Turn', '#555'],
  ];

  function renderTitleScreen(blink) {
    flatCanvas.style.display = 'none';
    pre.innerHTML = '';
    for (const [rawText, color] of TITLE_LINES) {
      const text = rawText === '@DIFFICULTY' ? `<  DIFFICULTY: ${DIFFICULTIES[difficulty].name}  >` : rawText;
      if (!text) { pre.appendChild(doc.createTextNode('\n')); continue; }
      const line = center(text);
      const rc = color === 'BLINK' ? (blink ? '#ff0' : '#440') : color;
      if (rc) {
        const span = doc.createElement('span');
        span.style.color = rc;
        span.textContent = line;
        pre.appendChild(span);
      } else {
        pre.appendChild(doc.createTextNode(line));
      }
      pre.appendChild(doc.createTextNode('\n'));
    }
  }

  // ─── DEATH / WIN SCREENS ────────────────────────────────────────────────────
  // Shown once (endDrawn guards it) after gameOver or won. The clock uses endTime so it is frozen at the moment the
  // game ended. The level name comes from LEVELS. After this the loop waits for Enter (startLevel) or ESC.
  function renderEndScreen(victory) {
    const elapsed = Math.floor(((endTime || Date.now()) - gameStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    flatCanvas.style.display = 'none';
    pre.innerHTML = '';
    const lines = victory ? [
      ['', null],
      ['  ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★  ', '#ff0'],
      ['', null],
      ['         LEVEL COMPLETE!          ', '#0f0'],
      ['', null],
      [`         ${LEVELS[levelIndex].name}             `, '#0f0'],
      ['', null],
      [`  Time:    ${mm}:${ss}   (par ${Math.floor((LEVELS[levelIndex].par ?? 0) / 60)}:${String((LEVELS[levelIndex].par ?? 0) % 60).padStart(2, '0')})   `, '#aaa'],
      [`  Kills:   ${kills} / ${countLevelEnemies()}         `, '#aaa'],
      [`  Secrets: ${secretsFound} / ${secretsTotal}                `, '#aaa'],
      [`  Score:   ${score}                `, '#ff0'],
      ['', null],
      ['  ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★  ', '#ff0'],
      ['', null],
      [levelIndex + 1 < LEVELS.length ? '    ENTER: NEXT LEVEL   ESC: EXIT' : '  ENTER: PLAY AGAIN   ESC: EXIT', '#555'],
    ] : [
      ['', null],
      ['  ██████████████████████████████  ', '#600'],
      ['', null],
      ['            YOU DIED              ', '#f00'],
      ['', null],
      [`  Time:    ${mm}:${ss}             `, '#666'],
      [`  Kills:   ${kills} / ${countLevelEnemies()}         `, '#666'],
      [`  Secrets: ${secretsFound} / ${secretsTotal}                `, '#666'],
      [`  Score:   ${score}                `, '#666'],
      ['', null],
      ['  ██████████████████████████████  ', '#600'],
      ['', null],
      ['    ENTER: TRY AGAIN   ESC: EXIT', '#555'],
    ];
    for (const [text, color] of lines) {
      if (!text) { pre.appendChild(doc.createTextNode('\n')); continue; }
      const line = center(text);
      if (color) {
        const span = doc.createElement('span');
        span.style.color = color;
        span.textContent = line;
        pre.appendChild(span);
      } else {
        pre.appendChild(doc.createTextNode(line));
      }
      pre.appendChild(doc.createTextNode('\n'));
    }
  }

  // ─── TITLE LOOP ─────────────────────────────────────────────────────────────
  // Title phase: the same `keys` handlers are active, Left/Right choose the difficulty, the loop waits for Enter or Space, then clears those keys so the
  // key press does not carry into the game. Heavy work (sprite decode, sound decode, validation, music) is done after
  // that, so the title appears at once. ESC at any point before the game loop goes straight to cleanup().
  hud.style.display = 'none';
  let onTitle = true, blinkState = true, blinkCounter = 0, prevL = false, prevR = false;
  const difficultyIds = Object.keys(DIFFICULTIES);
  while (onTitle && running) {
    blinkCounter++;
    if (blinkCounter % 12 === 0) blinkState = !blinkState;
    // Left/Right cycle the difficulty (edge-triggered so holding the key doesn't spin through it)
    const L = !!keys['ArrowLeft'], R = !!keys['ArrowRight'];
    const dir = (R && !prevR ? 1 : 0) - (L && !prevL ? 1 : 0);
    if (dir) difficulty = difficultyIds[(difficultyIds.indexOf(difficulty) + dir + difficultyIds.length) % difficultyIds.length];
    prevL = L; prevR = R;
    renderTitleScreen(blinkState);
    if (keys['Enter'] || keys[' ']) onTitle = false;
    await ns.sleep(50);
    if (!running) break;
  }
  keys['Escape'] = false; keys['Enter'] = false; keys[' '] = false;
  if (!running) { cleanup(); return; }

  // Browsers can start the AudioContext suspended until a user gesture; the Enter key counts.
  audioCtx.resume().catch(() => { });

  pre.textContent = '\n'.repeat(10) + center('LOADING...');

  await preloadSprites();
  buildFlats();
  await loadAllSounds();
  checkGameData();

  if (!running) { cleanup(); return; }   // ESC pressed while loading

  // Music loop
  if (sfx[SOUNDS.music]) {
    musicSrc = audioCtx.createBufferSource();
    musicSrc.buffer = sfx[SOUNDS.music];
    musicSrc.loop = true;
    const musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.4;
    musicSrc.connect(musicGain);
    musicGain.connect(audioCtx.destination);
    musicSrc.start();
  }

  gameStartTime = Date.now();
  hud.style.display = 'flex';
  face.style.visibility = 'visible';

  // ─── MAIN GAME LOOP ─────────────────────────────────────────────────────────
  // Player tuning, all per tick: movement in tiles, turn in radians. The player is a square of half-width
  // PLAYER_RADIUS tested at its four corners, and x and y are tested separately so the player slides along walls.
  const SPEED = 0.105, TURN = 0.065, STRAFE_SPEED = 0.0975, PLAYER_RADIUS = 0.2;
  // The player is a small square, not a point, so the camera can't poke into walls
  const canStand = (x, y) =>
    !solidAt(x - PLAYER_RADIUS, y - PLAYER_RADIUS) && !solidAt(x + PLAYER_RADIUS, y - PLAYER_RADIUS) &&
    !solidAt(x - PLAYER_RADIUS, y + PLAYER_RADIUS) && !solidAt(x + PLAYER_RADIUS, y + PLAYER_RADIUS);

  // Remove entries failing `keep` without allocating a new array
  function compactInPlace(arr, keep) {
    let k = 0;
    for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[k++] = arr[i];
    arr.length = k;
  }

  // ── Enemy behaviour (reads everything from the ENEMIES table) ──────────────
  // ENEMY AI OVERVIEW. Each living enemy runs updateEnemy() once per tick: (1) chase the player if it is within
  // `sight`, within `roam` of its spawn point and visible, or else walk to where it last saw/heard the player;
  // (2) roll every entry of def.attacks independently.
  // Enemies that see the target walk straight at it; otherwise they follow an A* route (see Path-finding below) to the
  // last place they saw or heard you for TUNING.alertMemoryTicks (or to your current position if `relentless`).
  // They open plain doors, avoid walking into each other and sidestep when blocked. An enemy beyond `roam` stops
  // moving for good. Dead enemies are skipped by the AI; their death animation is advanced separately in updateGame().
  // SPAWNERS: an attack of kind 'spawn' (Pain Elemental: Lost Souls, Arch-vile: any enemy) summons enemies instead of
  // hurting you (trySpawn). They are limited per spawner (maxAlive) and overall (TUNING.maxEnemies), count for no kills
  // or points, and are deleted from `enemies` shortly after they die, so never keep an index into that array.
  // Move an enemy a step in direction (dx, dy) (dist = its length), sliding along walls. Does not walk into other
  // living enemies it would get closer to. If completely blocked it opens an unlocked door in front of it, then
  // tries to sidestep (e.side picks the direction and flips whenever the sidestep is blocked too).
  function moveEnemy(e, dx, dy, dist, spd) {
    if (dist < 1e-6) return;
    const r = e.def.radius;
    const crowded = (nx, ny) => enemies.some(o => {
      if (o === e || !o.alive) return false;
      const dn = Math.hypot(o.x - nx, o.y - ny);
      return dn < r + o.def.radius && dn < Math.hypot(o.x - e.x, o.y - e.y);   // overlapping AND closing in
    }) || decor.some(d => {
      if (!d.solid) return false;
      const dn = Math.hypot(d.x - nx, d.y - ny);
      return dn < r + d.r && dn < Math.hypot(d.x - e.x, d.y - e.y);            // solid decorations block too
    });
    const step = (ux, uy) => {
      const nx = e.x + ux * spd, ny = e.y + uy * spd, ox = e.x, oy = e.y;
      if (!solidAt(nx + r, e.y) && !solidAt(nx - r, e.y) && !solidAt(nx, e.y + r) && !solidAt(nx, e.y - r) && !crowded(nx, e.y)) e.x = nx;
      if (!solidAt(e.x + r, ny) && !solidAt(e.x - r, ny) && !solidAt(e.x, ny + r) && !solidAt(e.x, ny - r) && !crowded(e.x, ny)) e.y = ny;
      return e.x !== ox || e.y !== oy;
    };
    const ux = dx / dist, uy = dy / dist;
    if (step(ux, uy)) return;
    // Blocked: is it a plain (unlocked, closed) door? Enemies can open those; locked ones stay shut to them.
    const fx = e.x + ux * (r + 0.45), fy = e.y + uy * (r + 0.45);
    const di = Math.floor(fy) * MW + Math.floor(fx);
    if (tileAt(fx, fy) === TILE.DOOR && !doorKey[di] && !doorOpen[di]) {
      doorOpen[di] = 1;
      doorHold[di] = TUNING.doorAutoCloseTicks;
      playAt(SOUNDS.door, fx, fy, 0.6);
    }
    const a = Math.atan2(uy, ux) + e.side;
    if (!step(Math.cos(a), Math.sin(a))) e.side = -e.side;
  }

  // ── Path-finding ───────────────────────────────────────────────────────────
  // Enemies that can SEE their target walk straight at it (moveEnemy). When they cannot (the target is behind a
  // wall, or they are heading for a remembered spot) they follow a route found by A* over the map's tiles:
  //   findPath()   A* on the tile grid (8 directions, no corner cutting) from one tile to another. Walkable means
  //                not `blocked`, OR a closed door with no lock (enemies open those). Locked key doors, secrets and
  //                walls are walls. Nukage tiles cost 4x so routes avoid them when there is an alternative.
  //                Returns the tile indices from start to goal, or the closest it could get if the goal is
  //                unreachable or the 3000-node search limit was hit, or null if there is nothing useful.
  //   followPath() keeps a route in e.path, refreshes it when the goal tile changed (at most every 10 ticks) or it is
  //                old/stuck, and steers at the farthest of the next few waypoints it has a clear straight line to,
  //                which keeps movement smooth instead of tile-to-tile zig-zagging.
  // Cost control: only enemies that can NOT see their target search, and at most 2 searches run per tick across all
  // enemies (pathBudget, refilled in updateGame); an enemy that misses out keeps its old route or walks straight.
  // The scratch arrays are reused (a stamp number marks the current search, so nothing is cleared) and are
  // reallocated when the map size changes.
  let pathBudget = 0;
  let pathBuf = null;
  const PATH_DX = [1, -1, 0, 0, 1, 1, -1, -1], PATH_DY = [0, 0, 1, -1, 1, -1, 1, -1];   // 4 straight, then 4 diagonal
  const heapNodes = [], heapF = [];   // binary min-heap of tile indices keyed by f score
  function heapPush(n, f) {
    let i = heapNodes.length;
    heapNodes.push(n); heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapNodes[p], heapNodes[i]] = [heapNodes[i], heapNodes[p]];
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      i = p;
    }
  }
  function heapPop() {
    const top = heapNodes[0], lastN = heapNodes.pop(), lastF = heapF.pop();
    if (heapNodes.length) {
      heapNodes[0] = lastN; heapF[0] = lastF;
      let i = 0;
      for (; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heapNodes.length && heapF[l] < heapF[m]) m = l;
        if (r < heapNodes.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heapNodes[m], heapNodes[i]] = [heapNodes[i], heapNodes[m]];
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
        i = m;
      }
    }
    return top;
  }

  const enemyWalkable = idx => !blocked[idx] || (tileKind[idx] === TILE.DOOR && !doorKey[idx]);

  function findPath(startIdx, goalIdx) {
    const N = MW * MH;
    if (!pathBuf || pathBuf.g.length !== N) {
      pathBuf = { g: new Float32Array(N), from: new Int32Array(N), mark: new Int32Array(N), done: new Int32Array(N), stamp: 0 };
    }
    const b = pathBuf, stamp = ++b.stamp;
    if (!enemyWalkable(startIdx) || !enemyWalkable(goalIdx)) return null;
    const gx = goalIdx % MW, gy = (goalIdx - gx) / MW;
    const h = idx => { const x = idx % MW, y = (idx - x) / MW, ax = Math.abs(x - gx), ay = Math.abs(y - gy); return Math.max(ax, ay) + 0.414 * Math.min(ax, ay); };
    heapNodes.length = 0; heapF.length = 0;
    b.mark[startIdx] = stamp; b.g[startIdx] = 0; b.from[startIdx] = -1;
    heapPush(startIdx, h(startIdx));
    let best = startIdx, bestH = h(startIdx), expansions = 0;
    while (heapNodes.length && expansions < 3000) {
      const cur = heapPop();
      if (b.done[cur] === stamp) continue;
      b.done[cur] = stamp; expansions++;
      if (cur === goalIdx) { best = cur; break; }
      const hc = h(cur);
      if (hc < bestH) { bestH = hc; best = cur; }
      const cx = cur % MW, cy = (cur - cx) / MW;
      for (let d = 0; d < 8; d++) {
        const nx = cx + PATH_DX[d], ny = cy + PATH_DY[d];
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ni = ny * MW + nx;
        if (b.done[ni] === stamp || !enemyWalkable(ni)) continue;
        if (d >= 4 && (!enemyWalkable(cy * MW + nx) || !enemyWalkable(ny * MW + cx))) continue;   // no cutting corners
        const ng = b.g[cur] + (d >= 4 ? 1.414 : 1) * (tileKind[ni] === TILE.HAZARD ? 4 : 1);
        if (b.mark[ni] !== stamp || ng < b.g[ni]) {
          b.mark[ni] = stamp; b.g[ni] = ng; b.from[ni] = cur;
          heapPush(ni, ng + h(ni));
        }
      }
    }
    const path = [];
    for (let n = best; n !== -1; n = b.from[n]) path.push(n);
    path.reverse();
    return path.length > 1 ? path : null;
  }

  // True if an enemy of radius r can walk the straight line (x1,y1)->(x2,y2): the centre line and two lines offset
  // by r on either side must all be free of solid tiles.
  function clearPath(x1, y1, x2, y2, r) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    const nx = -dy / d * r, ny = dx / d * r;
    return hasLineOfSight(x1, y1, x2, y2) && hasLineOfSight(x1 + nx, y1 + ny, x2 + nx, y2 + ny) && hasLineOfSight(x1 - nx, y1 - ny, x2 - nx, y2 - ny);
  }

  // Move enemy e one step along a route to world point (gx, gy). Returns false if no route is known (the caller then
  // falls back to walking straight at the point).
  function followPath(e, gx, gy, spd) {
    const tx = Math.floor(gx), ty = Math.floor(gy);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false;
    const goalIdx = ty * MW + tx;
    e.pathAge++;
    if (Math.hypot(e.x - e.lastX, e.y - e.lastY) < 0.002) e.stuck++; else e.stuck = 0;
    e.lastX = e.x; e.lastY = e.y;
    if (e.stuck > 10) { e.pathAge = 99; e.stuck = 0; }
    const stale = !e.path || e.pathI >= e.path.length - 1 || (e.pathGoal !== goalIdx && e.pathAge >= 10) || e.pathAge >= 40;
    if (stale && pathBudget > 0) {
      pathBudget--;
      e.path = findPath(Math.floor(e.y) * MW + Math.floor(e.x), goalIdx);
      e.pathGoal = goalIdx; e.pathAge = 0; e.pathI = 1;
    }
    const path = e.path;
    if (!path || e.pathI >= path.length) return false;
    const cx = i => (path[i] % MW) + 0.5, cy = i => Math.floor(path[i] / MW) + 0.5;
    while (e.pathI < path.length - 1 && Math.hypot(cx(e.pathI) - e.x, cy(e.pathI) - e.y) < 0.45) e.pathI++;
    let target = e.pathI;
    for (let k = Math.min(path.length - 1, e.pathI + 8); k > e.pathI; k--) {
      if (clearPath(e.x, e.y, cx(k), cy(k), e.def.radius)) { target = k; break; }
    }
    const wx = cx(target) - e.x, wy = cy(target) - e.y;
    moveEnemy(e, wx, wy, Math.hypot(wx, wy), spd);
    return true;
  }

  // Wake enemies near (x, y) after a noise (a shot): they go to that spot. Distance is halved behind walls.
  function alertEnemies(x, y, radius) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius || (d > radius * 0.5 && !hasLineOfSight(e.x, e.y, x, y))) continue;
      e.memX = x; e.memY = y; e.memTicks = TUNING.alertMemoryTicks;
    }
  }

  // The player just opened the door at tile (mx, my): every living enemy with def.wakeOnDoor that is in the room
  // behind it charges at the player, however far away it is. "The room" is found by flood-filling outward from
  // the far side of the door through walkable tiles. Closed doors and walls stop the fill, so other rooms (and
  // other enemies of the same type elsewhere in the level) are not affected. The fill starts at every walkable
  // neighbour of the door except the tile the player stands in, and is capped so a huge open level can't wake everything.
  function wakeBeyondDoor(mx, my) {
    const ptx = Math.floor(px), pty = Math.floor(py);
    const seen = new Set([my * MW + mx, pty * MW + ptx]);
    const queue = [];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = mx + ox, ty = my + oy;
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || seen.has(ty * MW + tx) || blocked[ty * MW + tx]) continue;
      seen.add(ty * MW + tx);
      queue.push(ty * MW + tx);
    }
    for (let q = 0; q < queue.length && q < 3000; q++) {
      const idx = queue[q], x = idx % MW, y = (idx - x) / MW;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tx = x + ox, ty = y + oy, n = ty * MW + tx;
        if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || seen.has(n) || blocked[n]) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    for (const e of enemies) {
      if (!e.alive || !e.def.wakeOnDoor || !seen.has(Math.floor(e.y) * MW + Math.floor(e.x))) continue;
      e.memX = px; e.memY = py; e.memTicks = TUNING.alertMemoryTicks * 2;   // generous: it may have a long way to run
    }
  }

  // Projectiles fly until they hit a wall or the player
  // Spawns an enemy shot aimed at the player's CURRENT position (no leading) plus an angular `spread` offset.
  // `type` must be a key of PROJECTILES (checkGameData disables attacks that name an unknown one). `damage`
  // overrides the projectile's default. Enemy shots only collide with walls and the player.
  // `side` moves the shot's start sideways from the enemy's centre (tiles, perpendicular to the line to the player;
  // ignored if that spot is inside a wall). The aim is then taken from the shifted start so both shots reach the player.
  function fireProjectile(e, type, spread = 0, damage, side = 0) {
    const def = PROJECTILES[type];
    const base = Math.atan2(py - e.y, px - e.x);
    let sx = e.x, sy = e.y;
    if (side) {
      const ox = e.x - Math.sin(base) * side, oy = e.y + Math.cos(base) * side;
      if (!solidAt(ox, oy)) { sx = ox; sy = oy; }
    }
    const angle = Math.atan2(py - sy, px - sx) + spread;
    projectiles.push({
      x: sx, y: sy,
      dx: Math.cos(angle) * def.speed, dy: Math.sin(angle) * def.speed,
      owner: 'enemy', alive: true, damage: damage ?? def.damage, type, bypassArmor: def.bypassArmor ?? false,
    });
  }

  // An ENEMY shot has hit a wall or the player: remove it and leave a short impact marker. The marker uses the
  // projectile's "<Type>_projectile_impact" art when that exists; otherwise (no sprite, or a type with no impact art
  // such as the Cyberdemon) an ASCII puff, so an impact never shows the flying projectile frozen in place.
  function enemyShotLanded(p) {
    p.alive = false;
    const d = PROJECTILES[p.type];
    const n = d.sprite ? spriteCache[d.sprite]?.impact?.length || 0 : 0, art = n ? d.sprite : false;
    // several impact frames play through once (2 ticks each); a single image just shows for 6 ticks
    effects.push({ x: p.x, y: p.y, ttl: n > 1 ? n * 2 : 6, sprite: art, anim: 'impact', blob: d.blob ?? HIT_BLOB, ...(n > 1 ? { n, tpf: 2, scale: 1.5 } : {}) });
    if (d.hitSound) playAt(d.hitSound, p.x, p.y, 0.8);
  }

  // Builds the runtime record of one enemy (see the enemy record notes in GAME STATE). Used by startLevel() for the
  // enemies placed in the map and by trySpawn() for summoned ones; hit points are scaled by the difficulty.
  function makeEnemy(type, x, y) {
    const hp = Math.max(1, Math.round(ENEMIES[type].hp * DIFFICULTIES[difficulty].enemyHp));
    return {
      type, def: ENEMIES[type],
      x, y, spawnX: x, spawnY: y,
      hp, maxHp: hp,
      alive: true, deathFrame: -1, isAttacking: false, attackTimer: 0,
      memX: 0, memY: 0, memTicks: 0, pain: 0, side: Math.random() < 0.5 ? 1 : -1,
      path: null, pathI: 0, pathGoal: -1, pathAge: 99, stuck: 0, lastX: x, lastY: y,
      spawned: false, kids: [],
    };
  }
  // The kill total shown on the end screen: only enemies that were placed in the map (summoned ones and barrels don't count).
  const countLevelEnemies = () => enemies.reduce((n, e) => n + (e.spawned || e.def.prop ? 0 : 1), 0);

  // SPAWNER ATTACKS (kind 'spawn'). Picks an enemy type from atk.spawn: one id, a list of ids, or 'any' (every type
  // not marked spawnable:false), weighted by ENEMIES[id].spawnWeight.
  function pickSpawnType(spec) {
    const ids = spec === 'any' ? Object.keys(ENEMIES).filter(id => ENEMIES[id].spawnable !== false) : [].concat(spec);
    let r = Math.random() * ids.reduce((sum, id) => sum + ENEMIES[id].spawnWeight, 0);
    for (const id of ids) { r -= ENEMIES[id].spawnWeight; if (r < 0) return id; }
    return ids[ids.length - 1];
  }
  // Summons up to atk.count enemies in free floor 1.2-2.5 tiles from `parent`, in its line of sight and not on top of
  // the player or another enemy. It does not create them at once: each spot gets a fire-spike WARNING (art
  // "Spawn_Warning_idle1..", ASCII sparks without it) and the enemy appears TUNING.spawnWarningTicks later, from
  // updatePendingSpawns(). Returns false (and does nothing) when the parent already has atk.maxAlive living or
  // announced spawn, when TUNING.maxEnemies enemies are alive or announced, or when no free spot was found; the attack
  // roll then simply happens again later. Summoned enemies start awake (they know where you are) and are flagged
  // `spawned`. Side effects: pushes onto `pendingSpawns` and `effects`.
  function trySpawn(parent, atk) {
    parent.kids = parent.kids.filter(k => k.alive);
    let alive = 0;
    for (const o of enemies) if (o.alive) alive++;
    alive += pendingSpawns.length;
    let mine = parent.kids.length + pendingSpawns.filter(p => p.parent === parent).length;
    let made = 0;
    for (let n = 0; n < (atk.count ?? 1); n++) {
      if (mine >= (atk.maxAlive ?? 4) || alive >= TUNING.maxEnemies) break;
      const type = pickSpawnType(atk.spawn), r = ENEMIES[type].radius;
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * Math.PI * 2, d = 1.2 + Math.random() * 1.3;
        const x = parent.x + Math.cos(a) * d, y = parent.y + Math.sin(a) * d;
        if (!spawnSpotFree(x, y, r, parent)) continue;
        pendingSpawns.push({ x, y, type, parent, ttl: TUNING.spawnWarningTicks });
        // cycle = how many warning frames to flip through (0 when there is no art: the ASCII blob is drawn instead)
        effects.push({ x, y, ttl: TUNING.spawnWarningTicks, sprite: 'SPAWNWARNING', ground: true, scale: 2.5, cycle: framesFor('SPAWNWARNING', 'idle')?.length || 0,
          anim: 'idle', blob: { tag: '\x19', chars: '^*+.', size: 0.5 } });
        mine++; alive++; made++;
        break;
      }
    }
    return made > 0;
  }
  // Is (x, y) a legal place for an enemy of body radius r to appear: open floor, visible from `parent`, not within 1.5
  // tiles of the player, not on top of another enemy or a solid decoration?
  function spawnSpotFree(x, y, r, parent) {
    if (solidAt(x + r, y) || solidAt(x - r, y) || solidAt(x, y + r) || solidAt(x, y - r)) return false;
    if (!hasLineOfSight(parent.x, parent.y, x, y) || Math.hypot(x - px, y - py) < 1.5) return false;
    if (enemies.some(o => o.alive && Math.hypot(o.x - x, o.y - y) < o.def.radius + r)) return false;
    return !decor.some(d => d.solid && Math.hypot(d.x - x, d.y - y) < d.r + r);
  }
  // Runs once per tick: counts the warnings down and, when one reaches 0, creates the enemy (unless its summoner
  // has died meanwhile, or the spot got blocked in the half second since: then that summon is simply lost).
  function updatePendingSpawns() {
    for (const p of pendingSpawns) {
      if (--p.ttl > 0) continue;
      const r = ENEMIES[p.type].radius;
      if (p.parent.alive && spawnSpotFree(p.x, p.y, r, p.parent)) {
        const m = makeEnemy(p.type, p.x, p.y);
        m.spawned = true; m.memX = px; m.memY = py; m.memTicks = TUNING.alertMemoryTicks;
        enemies.push(m); p.parent.kids.push(m);
        effects.push({ x: p.x, y: p.y, ttl: 8, sprite: false, anim: 'impact', blob: { tag: '\x19', chars: '*+.', size: 0.9 } });
      }
    }
    compactInPlace(pendingSpawns, p => p.ttl > 0);
  }

  // How many ticks an enemy's death animation lasts: 2 ticks per frame of its "<Type>_death" art, but never less than
  // DEATH_FRAMES. This is what lets any number of death frames play through to the last one (the corpse then stays on it).
  const deathLength = e => Math.max(DEATH_FRAMES, (framesFor(e.type, 'die')?.length || 1) * 2);

  // The explosion of an enemy that has just died (def.onDeath.explode, see the ENEMIES legend), fired once from the
  // death-animation step of updateGame(). Plain explosions (Lost Soul) only hurt the player, with full damage anywhere
  // inside the radius. With hurtsEnemies it also damages every living enemy and barrel in the radius through hitEnemy()
  // (so kills and chain reactions work; a barrel killed here explodes on its own turn in the same step or the next
  // tick). With falloff, damage fades linearly to zero at the edge and walls shelter the victim.
  function deathBlast(e, boom) {
    if (boom.sound) playAt(boom.sound, e.x, e.y, 1.0);
    const dmgAt = d => boom.damage * (boom.falloff ? 1 - d / boom.radius : 1);
    const reaches = (x, y, d) => d < boom.radius && (!boom.falloff || hasLineOfSight(e.x, e.y, x, y));
    if (boom.hurtsEnemies) {
      for (const o of enemies) {
        if (!o.alive) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (reaches(o.x, o.y, d)) hitEnemy(o, dmgAt(d), o.x, o.y, false);
      }
    }
    const pd = Math.hypot(px - e.x, py - e.y);
    if (reaches(px, py, pd)) hurtPlayer(dmgAt(pd), boom.label, { volume: 0 });
    const nArt = boom.art ? framesFor(boom.art, 'idle')?.length || 0 : 0;
    if (nArt) effects.push({ x: e.x, y: e.y, ttl: nArt * 2, sprite: boom.art, anim: 'idle', n: nArt, tpf: 2, scale: boom.scale ?? 2 });
    if (boom.blob && !nArt && !framesFor(e.type, 'die')) {
      effects.push({ x: e.x, y: e.y, ttl: boom.blob.ttl ?? 8, sprite: false, anim: 'impact', blob: boom.blob });
    }
  }

  // The visible extras of a dying enemy's onDeath block (see the ENEMIES legend), made once in the first tick after the kill:
  // a few smoke puffs ("<Type>_idle1..N" played once) and two gun pieces thrown out to either side of the line to the
  // player, tumbling until they slide to a stop (a wall stops them early). Effects only: no gameplay.
  function deathExtras(e, od) {
    for (let i = 0; i < 3 && od.smoke?.length; i++) {
      const art = od.smoke[Math.floor(Math.random() * od.smoke.length)], n = framesFor(art, 'idle')?.length || 0;
      if (n) effects.push({ x: e.x + (Math.random() - 0.5) * 0.6, y: e.y + (Math.random() - 0.5) * 0.6, ttl: n * 3 + i * 4, sprite: art, anim: 'idle', n, tpf: 3, scale: 2 });
    }
    const n = od.debris ? framesFor(od.debris, 'idle')?.length || 0 : 0;
    if (n) {
      const away = Math.atan2(py - e.y, px - e.x);
      for (const side of [-1, 1]) {
        const a = away + side * Math.PI / 2 + (Math.random() - 0.5) * 0.6, v = 0.12 + Math.random() * 0.05;
        effects.push({ x: e.x, y: e.y, ttl: 3000, sprite: od.debris, anim: 'idle', n, tumble: true, ground: true, scale: 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
      }
    }
  }
  // onDeath.spawn: something climbs out of the wreck (one random type from sp.types), awake and hunting. It tries a few
  // spots around the wreck and falls back to the wreck's own tile. Skipped when TUNING.maxEnemies are alive. Flagged
  // `spawned` like summoned enemies (no kill, no points, no corpse left behind).
  function deathSpawn(e, sp) {
    let alive = 0;
    for (const o of enemies) if (o.alive) alive++;
    if (alive + pendingSpawns.length >= TUNING.maxEnemies) return;
    const type = sp.types[Math.floor(Math.random() * sp.types.length)], r = ENEMIES[type].radius;
    let x = e.x, y = e.y;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 0.4, tx = e.x + Math.cos(a) * d, ty = e.y + Math.sin(a) * d;
      if (!solidAt(tx + r, ty) && !solidAt(tx - r, ty) && !solidAt(tx, ty + r) && !solidAt(tx, ty - r) && hasLineOfSight(e.x, e.y, tx, ty)) { x = tx; y = ty; break; }
    }
    const m = makeEnemy(type, x, y);
    m.spawned = true; m.memX = px; m.memY = py; m.memTicks = TUNING.alertMemoryTicks;
    enemies.push(m);
    effects.push({ x, y, ttl: 8, sprite: false, anim: 'impact', blob: { tag: '\x19', chars: '*+.', size: 0.9 } });
  }

  // Executes one attack entry that has already passed its range/chance/line-of-sight roll. Plays the sound, starts the
  // attack animation (unless atk.animate is false) and either fires atk.count projectiles, applies melee damage
  // immediately through hurtPlayer(), or (kind 'spawn') summons enemies via trySpawn().
  function enemyAttack(e, atk) {
    if (atk.kind === 'spawn' && !trySpawn(e, atk)) return;   // nothing summoned: no sound, no animation
    if (atk.sound) playAt(atk.sound, e.x, e.y, atk.volume ?? 0.8);
    if (atk.animate !== false) { e.isAttacking = true; e.attackTimer = ATTACK_ANIM_TICKS; }
    if (atk.kind === 'ranged') {
      const sides = atk.muzzles ?? Array.from({ length: atk.count ?? 1 }, () => 0);
      for (const side of sides) {
        fireProjectile(e, atk.projectile, (Math.random() - 0.5) * (atk.spread ?? 0), atk.damage, side);
      }
    } else if (atk.kind === 'melee') {
      hurtPlayer(atk.damage, atk.label ?? 'HIT!', {
        bypass: atk.bypassArmor, ignoreCritical: atk.ignoreCritical, style: e.def.boss ? 'boss' : '',
      });
    }   // 'spawn' attacks did their work in trySpawn()
  }

  // Per-tick brain of one living enemy. `los` is computed lazily and cached because line of sight is the most
  // expensive check. Speed may be a function of the enemy (the Cyberdemon speeds up as it is hurt). Note that `sight`
  // does not limit attacks: an attack fires whenever the player is inside its range and visible and its chance roll succeeds.
  // Order: finish attack animation timer -> flinch (pain) -> see/remember -> move -> attacks.
  // A seen player is chased straight in until def.stopDistance (so a melee enemy parks at biting range rather than
  // overlapping you); the attack rolls below then fire independently each tick.
  function updateEnemy(e) {
    const def = e.def;
    if (e.attackTimer > 0 && --e.attackTimer === 0) e.isAttacking = false;

    const dx = px - e.x, dy = py - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Line of sight is the expensive check: compute it lazily, at most once per enemy per tick
    let losCache;
    const los = () => (losCache ??= hasLineOfSight(e.x, e.y, px, py));

    // Flinching: no moving or attacking until it passes
    if (e.pain > 0) { e.pain--; return; }

    // See / remember: whenever it can see the player it records where; when it can't (behind a corner, or it only
    // heard a shot) it keeps walking to the last recorded spot until memTicks runs out or it gets there.
    const sees = dist < def.sight && los();
    if (sees) { e.memX = px; e.memY = py; e.memTicks = TUNING.alertMemoryTicks; }
    const spd = typeof def.speed === 'function' ? def.speed(e) : def.speed;
    const spawnDist = Math.hypot(e.x - e.spawnX, e.y - e.spawnY);
    if (spd > 0 && spawnDist < def.roam) {
      if (sees) {
        if (dist > def.stopDistance) moveEnemy(e, dx, dy, dist, spd);   // else: already in biting range, hold and attack
      } else if (e.memTicks > 0) {
        // Cannot see the player: go to the remembered spot along a found route (straight line only if no route is
        // known). A `relentless` enemy instead keeps tracking where the player is NOW until its memory runs out.
        const tx = def.relentless ? px : e.memX, ty = def.relentless ? py : e.memY;
        const mdx = tx - e.x, mdy = ty - e.y, md = Math.hypot(mdx, mdy);
        e.memTicks--;
        if (md < 0.6 && !def.relentless) e.memTicks = 0;
        else if (!followPath(e, tx, ty, spd)) moveEnemy(e, mdx, mdy, md, spd);
      }
    }

    // Attacks: each one rolls independently every tick (difficulty scales the chance)
    const aggression = DIFFICULTIES[difficulty].enemyChance;
    for (const atk of def.attacks) {
      if (dist < atk.range[0] || dist >= atk.range[1]) continue;
      if (Math.random() >= atk.chance * aggression || !los()) continue;
      enemyAttack(e, atk);
    }
  }

  // One simulation tick. Every speed, cooldown and probability in the game is tuned per tick, so the
  // loop below always advances the world in whole STEP_MS ticks, however long a frame takes to draw.
  // ORDER OF A TICK (the order is part of the behaviour; keep it unless you mean to change gameplay):
  //   1 turn (keys + mouse) and move the player   2 push the player out of living enemies (wall-checked)
  //   3 use / doors (updateDoors) / shoot / timers
  //   4 move projectiles (player shots are resolved here, hits call hitEnemy/explode)   5 pickups
  //   5b power-up timers and nukage   6 level exit
  //   7 enemy AI   8 corpse animation and death explosions   9 face and message timers.
  // So a shot fired this tick is already moving this tick, while a projectile an enemy fires in step 7 first moves
  // on the next tick. gameOver/won are set from inside this function; the frame loop stops calling it once they are set.
  function updateGame() {
    // ── Input ────────────────────────────────────────────────────────────
    if (keys['ArrowLeft'] || keys['a']) pa -= TURN;
    if (keys['ArrowRight'] || keys['d']) pa += TURN;
    pa += mouseTurn; mouseTurn = 0;   // mouse look, accumulated by onMouseMove

    let fwd = 0, side = 0;
    if (powers.frozen <= 0) {   // frozen: no walking or strafing (turning, shooting and using still work)
      if (keys['ArrowUp'] || keys['w']) fwd += 1;
      if (keys['ArrowDown'] || keys['s']) fwd -= 1;
      if (keys['q']) side -= 1;
      if (keys['e']) side += 1;
    }
    const diag = (fwd && side) ? Math.SQRT1_2 : 1;   // no faster diagonal movement
    const mvx = (Math.cos(pa) * fwd * SPEED + Math.cos(pa + Math.PI / 2) * side * STRAFE_SPEED) * diag;
    const mvy = (Math.sin(pa) * fwd * SPEED + Math.sin(pa + Math.PI / 2) * side * STRAFE_SPEED) * diag;
    const nx = px + mvx, ny = py + mvy;
    if (canStand(nx, py)) px = nx;
    if (canStand(px, ny)) py = ny;

    // ── Player/Enemy collision ───────────────────────────────────────────
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = px - e.x, dy = py - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = 0.7;
      if (dist < minDist && dist > 0) {
        const push = (minDist - dist) / dist;
        const pushX = dx * push * 0.5, pushY = dy * push * 0.5;
        if (canStand(px + pushX, py)) px += pushX;   // never shove the player into a wall
        if (canStand(px, py + pushY)) py += pushY;
      }
    }
    // Solid decorations push the player out completely (they never move, so no half-and-half like enemies)
    for (const d of decor) {
      if (!d.solid) continue;
      const dx = px - d.x, dy = py - d.y, dist = Math.hypot(dx, dy), minDist = d.r + PLAYER_RADIUS;
      if (dist < minDist && dist > 0) {
        const push = (minDist - dist) / dist;
        if (canStand(px + dx * push, py)) px += dx * push;
        if (canStand(px, py + dy * push)) py += dy * push;
      }
    }

    const useKey = !!(keys['f']);
    if (useKey && !prevUseKey && useCooldown <= 0) { tryUse(); useCooldown = 12; }
    prevUseKey = useKey;
    if (useCooldown > 0) useCooldown--;
    if (flashTimer <= 0 && usableDecorAhead()) flash('PRESS F TO USE THE TERMINAL', 3);
    updateDoors();
    if (keys[' '] || keys['mouse0']) shoot();
    if (shootCooldown > 0) shootCooldown--;
    if (muzzleFlash > 0) muzzleFlash--;
    if (afterglow > 0) afterglow--;

    // Decay damage numbers
    damageNumbers = damageNumbers.filter(d => d.ttl-- > 0);

    // ── Projectiles + impact markers ─────────────────────────────────────
    // Projectiles move in `steps` sub-steps of at most about 0.15 tiles so fast shots cannot skip over thin walls or
    // enemies. Player shots test enemy hitboxes (first living enemy in array order wins); enemy shots test a 0.4 box
    // around the player. Dead projectiles are compacted out of the array afterwards.
    for (const p of projectiles) {
      const def = PROJECTILES[p.type];
      const steps = Math.max(1, Math.ceil(def.speed / 0.15));   // small sub-steps so fast shots can't skip through things
      for (let i = 0; i < steps && p.alive; i++) {
        const nx = p.x + p.dx / steps, ny = p.y + p.dy / steps;
        if (solidAt(nx, ny)) {
          if (p.owner === 'player') explode(p, p.x, p.y, null);   // goes off just in front of the wall
          else enemyShotLanded(p);
          break;
        }
        p.x = nx; p.y = ny;
        if (p.owner === 'player') {
          const hit = enemies.find(e => e.alive && Math.abs(e.x - p.x) < e.def.hitbox && Math.abs(e.y - p.y) < e.def.hitbox);
          if (hit) explode(p, p.x, p.y, hit);
        } else if (Math.abs(p.x - px) < 0.4 && Math.abs(p.y - py) < 0.4) {
          enemyShotLanded(p);
          const freezes = def.freeze > 0 && powers.frozen <= 0 && freezeGrace <= 0 && powers.invuln <= 0;
          hurtPlayer(p.damage ?? 1, freezes ? 'FROZEN!' : 'HIT!', { bypass: p.bypassArmor, volume: 0.5 });
          if (freezes && !gameOver) powers.frozen = def.freeze;
        }
      }
    }
    compactInPlace(projectiles, p => p.alive);        // so the array doesn't grow for the whole session
    for (const fx of effects) {
      fx.ttl--; fx.age = (fx.age || 0) + 1;
      if (fx.vx || fx.vy) {   // thrown pieces slide, slow down and stop at a wall
        const nx = fx.x + fx.vx, ny = fx.y + fx.vy;
        if (solidAt(nx, ny)) fx.vx = fx.vy = 0;
        else { fx.x = nx; fx.y = ny; fx.vx *= 0.9; fx.vy *= 0.9; if (Math.hypot(fx.vx, fx.vy) < 0.01) fx.vx = fx.vy = 0; }
      }
    }
    compactInPlace(effects, fx => fx.ttl > 0);
    updatePendingSpawns();

    // ── Pickups ──────────────────────────────────────────────────────────
    for (const p of pickups) {
      if (!p.alive) continue;
      if (Math.abs(p.x - px) < 0.7 && Math.abs(p.y - py) < 0.7) {
        const def = PICKUPS[p.type];
        if (def && !pickupUseful(def)) continue;   // stat already full: leave it for later
        p.alive = false;
        if (def) collectPickup(def);
      }
    }

    // ── Timed power-ups and nukage ───────────────────────────────────────
    if (powers.frozen === 1) freezeGrace = TUNING.freezeGraceTicks;   // thawing out this tick: start the immunity window
    else if (freezeGrace > 0) freezeGrace--;
    for (const k in powers) if (powers[k] > 0) powers[k]--;
    if (tileAt(px, py) === TILE.HAZARD && powers.radsuit <= 0) {
      if (hazardTimer > 0) hazardTimer--;
      else { hazardTimer = TUNING.hazard.interval; hurtPlayer(TUNING.hazard.damage, TUNING.hazard.label, { volume: 0.4 }); }
    } else hazardTimer = 0;
    // ── Exit check ───────────────────────────────────────────────────────
    if (tileAt(px, py) === TILE.EXIT) {
      won = true; endTime = Date.now(); score += 1000;
      flash(`${LEVELS[levelIndex].name.split(':')[0]} COMPLETE! +1000`, 9999);
      updateHud();
    }

    // ── Enemy AI ─────────────────────────────────────────────────────────
    exploreStep();    // fog of war for the automap
    pathBudget = 2;   // path searches allowed this tick, shared by all enemies (see followPath)
    for (const e of enemies) if (e.alive && !e.def.prop) updateEnemy(e);   // props (barrels) have no AI

    // ── Death animation progression ──────────────────────────────────────
    // deathFrame counts up each tick until DEATH_FRAMES, then freezes (the corpse stays on its last frame). A death
    // explosion (def.onDeath.explode) fires exactly once, when deathFrame is 0, i.e. in the first tick after the kill.
    for (const e of enemies) {
      if (e.deathFrame < 0) continue;
      const boom = e.def.onDeath?.explode;
      if (boom && e.deathFrame === 0) deathBlast(e, boom);
      const od = e.def.onDeath;
      if (od && e.deathFrame === 0) deathExtras(e, od);
      if (od?.spawn && !e.kidDone && e.deathFrame >= (od.spawn.at ?? 10)) { e.kidDone = true; deathSpawn(e, od.spawn); }
      if (e.deathFrame < deathLength(e)) e.deathFrame++;   // corpses freeze on the last frame
    }
    // Summoned enemies leave no permanent corpse, so a spawner can't make this array grow all game
    compactInPlace(enemies, e => !(e.spawned && !e.alive && e.deathFrame >= deathLength(e)));

    // ── Face + message timers ────────────────────────────────────────────
    if (faceHitTimer > 0) faceHitTimer--;
    else if (health > 0) faceEl.textContent = health < 30 ? FACES.lowHp : FACES.normal;
    if (flashTimer > 0) flashTimer--;
  }

  // Advances every door one tick. doorOpen is the target (set by tryUse, by auto-close, or by an enemy opening it);
  // doorPos 0..1 is the actual position. A door is passable (blocked = 0) from half open. A door that would become
  // solid on top of the player or an enemy springs back open instead of crushing them.
  function updateDoors() {
    for (const idx of doorList) {
      let pos = doorPos[idx];
      const mx = idx % MW, my = (idx - mx) / MW;
      if (doorOpen[idx]) {
        if (pos < 1) pos = Math.min(1, pos + TUNING.doorSpeed);
        else if (TUNING.doorAutoCloseTicks > 0 && --doorHold[idx] <= 0) {
          if (doorOccupied(mx, my)) doorHold[idx] = 25;                  // someone is in the doorway: wait
          else { doorOpen[idx] = 0; playAt(SOUNDS.door, mx + 0.5, my + 0.5, 0.6); }
        }
      } else if (pos > 0) {
        if (pos - TUNING.doorSpeed < 0.5 && doorOccupied(mx, my)) { doorOpen[idx] = 1; doorHold[idx] = 25; }
        else pos = Math.max(0, pos - TUNING.doorSpeed);
      }
      doorPos[idx] = pos;
      blocked[idx] = pos >= 0.5 ? 0 : 1;
    }
  }

  // ─── LEVEL LIFECYCLE ──────────────────────────────────────────────────────
  // startLevel is the ONLY place a level begins (first level, next level, retry, play again). mode:
  //   'fresh'  new game: starting loadout, score 0           'next'  carry health/armor/ammo/weapons/score over
  //   'retry'  restore the loadout the current level started with (levelStart)
  // It parses the map, then resets everything that belongs to a single level. If you add per-level state
  // anywhere in this file, reset it here, or it will leak from one level into the next.
  function resetLoadout() {
    health = START.health; armor = START.armor;
    for (const t in AMMO_TYPES) ammo[t] = ALL_WEAPONS ? AMMO_TYPES[t].max : AMMO_TYPES[t].start;
    owned.clear();
    for (const id of (ALL_WEAPONS ? Object.keys(WEAPONS) : START.weapons)) owned.add(id);
    currentWeapon = [...owned][0] ?? Object.keys(WEAPONS)[0];
  }

  function startLevel(index, mode) {
    if (mode === 'fresh') { resetLoadout(); score = 0; }
    else if (mode === 'retry' && levelStart) {
      health = levelStart.health; armor = levelStart.armor; score = levelStart.score;
      Object.assign(ammo, levelStart.ammo);
      owned.clear(); levelStart.owned.forEach(id => owned.add(id));
      currentWeapon = levelStart.currentWeapon;
    }
    levelIndex = index;
    parseMap(index);
    automapOpen = false;
    levelStart = { health, armor, score, ammo: { ...ammo }, owned: [...owned], currentWeapon };

    px = spawns.player.x; py = spawns.player.y; pa = -Math.PI / 2;
    heldKeys.clear();
    for (const k in powers) powers[k] = 0;
    kills = 0; secretsFound = 0;
    shootCooldown = 0; useCooldown = 0; muzzleFlash = 0; afterglow = 0; faceHitTimer = 0; hazardTimer = 0; mouseTurn = 0; freezeGrace = 0;
    flashMsg = ''; flashTimer = 0; flashStyle = '';
    gameOver = false; won = false; endDrawn = false; endTime = 0; gameStartTime = Date.now();
    damageNumbers = [];
    projectiles.length = 0; effects.length = 0; pendingSpawns.length = 0;
    frameWallTile.fill(TILE.WALL); frameWallIdx.fill(0);

    enemies.length = 0;
    for (const s of spawns.enemies) enemies.push(makeEnemy(s.type, s.x, s.y));
    pickups.length = 0;
    for (const p of spawns.pickups) pickups.push({ ...p, alive: true });
    decor.length = 0;
    // phase: a fixed per-position time offset (ms) so copies of an animated decoration don't flicker in step
    for (const d of spawns.decor) decor.push({ ...d, solid: !!DECORATIONS[d.type].solid, r: DECORATIONS[d.type].radius ?? 0.3, phase: Math.floor(d.x * 131 + d.y * 313) * 97 % 1000 });

    faceEl.textContent = FACES.normal;
    flash(LEVELS[index].name, 40);
    updateHud();
  }
  // FRAME LOOP. Each iteration: add the real time since the last iteration to an accumulator (capped at
  // STEP_MS * MAX_STEPS_PER_FRAME), run updateGame() once per whole STEP_MS in the accumulator, render once, update
  // the HUD, then sleep only the rest of TARGET_FRAME_MS. After gameOver/won the game stops simulating and shows the end
  // screen once, then Enter starts the next level / retries / plays again via startLevel(). Exceptions are printed to the
  // terminal and always end in cleanup() (finally).
  const STEP_MS = 40;            // length of one simulation tick (25 per second). Raise it to slow the game down.
  const MAX_STEPS_PER_FRAME = 5; // after a long stall (e.g. hidden tab) skip ahead instead of fast-forwarding
  const TARGET_FRAME_MS = 40;    // aim for ~25 frames per second

  try {
    startLevel(0, 'fresh');
    inGame = true;
    let last = Date.now(), acc = 0, prevEnter = false;
    while (running) {
      const frameStart = Date.now();
      acc = Math.min(acc + (frameStart - last), STEP_MS * MAX_STEPS_PER_FRAME);
      last = frameStart;

      if (paused) {
        // Frozen: no simulation, just keep the picture (and a PAUSED message) on screen
        acc = 0;
        if (automapOpen) flashTimer = 0; else flash('PAUSED  -  PRESS P', 2);   // the map has its own title
        renderFrame();
      } else if (!gameOver && !won) {
        // Catch the simulation up to real time, then draw once
        while (acc >= STEP_MS && !gameOver && !won) { updateGame(); acc -= STEP_MS; }
        renderFrame();
        updateHud();
      } else {
        // End screen: draw once (the clock is frozen at endTime), then wait for Enter
        if (!endDrawn) { renderEndScreen(won); endDrawn = true; prevEnter = !!keys['Enter']; }
        acc = 0;
        const enter = !!keys['Enter'];
        if (enter && !prevEnter) {
          if (won) { if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1, 'next'); else startLevel(0, 'fresh'); }
          else startLevel(levelIndex, 'retry');
          last = Date.now();
        }
        prevEnter = enter;
      }

      // Sleep only for what's left of the frame budget, so slow frames don't get an extra 40ms on top
      await ns.sleep(Math.max(1, TARGET_FRAME_MS - (Date.now() - frameStart)));
    }
  } catch (e) {
    ns.tprint(`ERROR: ${e.message}\n${e.stack ?? ''}`);
  } finally {
    cleanup();
  }
}
