# sprites.json Reference

**Last updated:** 2026-11-01
**Total sprites:** 344 images in the file + 2 aliases
**File:** `C:\Users\carly\Documents\Bitburner-Doom\sprites.json` (about 970 KB, **do not read it**: this file and `sprites_tool.py` replace reading it)

This is a helper for AI agents. It lists every sprite name the game knows and explains the file format and naming
rules, so a new sprite can be added without opening the big file.

## File format (checked against the real file)

- A single JSON object: `{ "Sprite_Name": "<base64 PNG>", ... }`. No arrays, no nesting.
- Pretty-printed: 2-space indent, **one entry per line**, **CRLF** line endings, no BOM.
- The last entry has **no trailing comma**, and the file ends with `}` on its own line with **no newline after it**.
- The value is raw base64 of a PNG file: starts `iVBORw0KGgo`, **no** `data:image/png;base64,` prefix, no line breaks.
- PNGs have transparency, roughly 15x15 px (small projectiles) up to about 130x130 px (big death frames and the largest decorations).
- Entries have no required order (the game sorts frames by number). The file is in the order sprites were added, and new
  entries go at the end (the script does this).
- Bitburner can only store text, which is why art is base64 inside JSON. The game decodes it at startup
  (`preloadSprites()` in `doom.js`).

## Naming standard

Key = `{Type}_{animation}{frame}` with `Capitalised_Words` for the type, for example `Imp_walk1`, `Lost_Soul_death3`,
`Cacodemon_projectile_impact`, `Candelabra_idle1`. Every sprite belongs to a type that exists in a table in `doom.js`;
**there is no generic or typeless art** (generic projectiles are drawn as ASCII by the game).

| Key shape | Meaning | Used for |
|---|---|---|
| `Type_walk1`, `Type_walk2`... | walk | moving / idle enemy, looping |
| `Type_attack1`... | attack | attack animation (shown briefly when it attacks) |
| `Type_death1`... | die | death animation; the **last frame stays as the corpse** (a barrel vanishes instead) |
| `Type_projectile` | idle | the enemy's shot in flight. **Exactly one image, no number** |
| `Type_projectile_impact` | impact | where the enemy's shot lands. **Exactly one image, no number** |
| `Type_idle1`, `Type_idle2`... | idle | pickups and decorations (one image), the barrel (looped), and animated decorations (looped, any number of frames) |

- Use `death`, never `dead` or `die` (the game still understands them, but the file is standardised on `death`).
- **Type** is matched by the game as: underscores removed, upper-cased (`Lost_Soul` -> `LOSTSOUL`, `Cyber_Demon` ->
  `CYBERDEMON`, `Hanging_Body_2` -> `HANGINGBODY2`). It must equal a key of one table in `doom.js`: `ENEMIES`
  (`BARON`, so `Baron_walk1`, **not** `Baron_of_Hell_walk1`), `PICKUPS` (weapon pickups use the weapon's key, keycards
  `BLUEKEY` and so on, invulnerability is `INVULN`) or `DECORATIONS`. For projectile art the enemy's entry in
  `PROJECTILES` must say `sprite: 'TYPE'` (done for Imp, Cacodemon, Lost Soul, Baron, Cryobus and Cyberdemon).
- Frames are played in numeric order starting at 1 with no gaps. No number means frame 1. A still decoration or pickup
  needs `_idle1`; a different number only works by accident.
- A missing animation falls back automatically (attack -> walk, impact -> idle, idle -> walk). No art at all for a type
  is fine: the game draws ASCII, and at startup it lists those things and suggests the closest sprite name when it
  looks like a typo.
- Only one projectile image and one impact image per enemy. Do not add numbered projectile frames.
- Decorations stand on the floor by default (`hang: true` hangs them from the ceiling). They are animated only when
  their `DECORATIONS` entry has `anim` (milliseconds per frame); otherwise only `_idle1` is shown.
- Pickups (including weapons) are one image each, drawn at a fixed size, with an ASCII glyph as the fallback.

## Shared images (aliases)

If two names should show the same picture, store the image **once** and add a line to `SPRITE_ALIASES` in `doom.js`
(`'alias name': 'name that exists in sprites.json'`). The game copies the image under the alias name at startup, so the
alias works like any other frame. Current aliases (also shown in the table below):

- `Lost_Soul_attack2` uses the image of `Lost_Soul_walk2`.
- `Lost_Soul_projectile_impact` uses the image of `Lost_Soul_death5`.

`python sprites_tool.py list` reports any two identical images so they can be turned into aliases. When adding a
sprite, do not store a copy of an image that already exists: add an alias line instead.

## Status by type (checked against `sprites.json` and the tables in `doom.js`)

### Enemies and props (`ENEMIES`)

| Enemy type | Sprite name | Art in the file | Notes |
|---|---|---|---|
| ZOMBIE | `Zombie_...` | walk 3, attack 2, death 10 | Its shotgun pellets are ASCII |
| ZOMBIESERGEANT | `Zombie_Sergeant_...` | walk 3, attack 2, death 5 | shotgun zombie (`Z`); its pellets are ASCII |
| IMP | `Imp_...` | walk 3, attack 3, death 10, projectile, impact |  |
| DEMON | `Demon_...` | walk 3, attack 3, death 6 | melee only |
| CACODEMON | `Cacodemon_...` | walk 2, attack 3, death 5, projectile, impact |  |
| LOSTSOUL | `Lost_Soul_...` | walk 2, attack 1, death 5, projectile | attack frame 2 and the impact are aliases |
| CYBERDEMON | `Cyber_Demon_...` | walk 4, attack 2, death 8, projectile, impact |  |
| BARON | `Baron_...` | walk 4, attack 4, death 5, projectile, impact | type is `Baron`, not `Baron_of_Hell` |
| SPIDERMASTERMIND | `Spider_Mastermind_...` | walk 4, attack 2, death 10 | its bullets are ASCII |
| ZOMBIETANK | `Zombie_Tank_...` | walk 3, attack 2, death 9 | machine-gun tank (`g`, replaced the Chaingunner); bullets are ASCII |
| ZOMBIEMISSILETANK | `Zombie_Missile_Tank_...` | walk 3, attack 2, death 9, projectile, impact (3 frames) | `8`; missiles have art |
| ZOMBIEPLASMATANK | `Zombie_Plasma_Tank_...` | walk 3, attack 2, death 9 | `9`; plasma balls are ASCII (the pack had no plasma art) |
| CRYOBUS | `Cryobus_...` | walk 6, attack 3, death 6 | art from the Cryocubus mod (front-facing frames); fireballs reuse the Cacodemon's projectile art (`sprite: 'CACODEMON'`) |
| PAINELEMENTAL | `Pain_Elemental_...` | walk 2, attack 3, death 5 | spawns Lost Souls, no projectile |
| ARCHVILE | `Arch_Vile_...` | walk 6, attack 10, death 7 | spawns random enemies, no projectile |
| BARREL | `Barrel_...` | idle 4, death 2 | looped idle, then the explosion plays as death |

Enemies without art show an ASCII body (`blob` in their `ENEMIES` entry) and projectiles with art type set but no
sprites yet show their ASCII `blob`; the PNG art takes over by itself as soon as the keys exist. Enemy projectile
impacts are spawned by the game when a shot hits a wall or the player; bullets hitting an enemy show a small ASCII puff (no art).

### Effects

| Type | Names | Status | Notes |
|---|---|---|---|
| TANKEXPLOSION | `Tank_Explosion_idle1`..`_idle20` | done, 20 frames | played once where a zombie tank dies (`onDeath.explode.art`) |
| TANKSMOKE1..4 | `Tank_Smoke_1_idle1`..`_idle9` (and `_2_`, `_3_`, `_4_`) | done, 9 frames each | smoke puffs over a tank wreck (`onDeath.smoke`) |
| TANKGUN, TANKMISSILEGUN, TANKPLASMAGUN | `Tank_Gun_idle1`..`7`, `Tank_Missile_Gun_idle1`..`7`, `Tank_Plasma_Gun_idle1`..`7` | done, 7 frames each | the guns thrown off a tank when it dies; tumble, then rest on the last frame (`onDeath.debris`) |
| SPAWNWARNING | `Spawn_Warning_idle1`, `_idle2` | done, 2 frames | fire cone + fire spike, flipped through every 3 ticks for `TUNING.spawnWarningTicks` where a Pain Elemental or Arch-vile is about to summon something. Shared by both. Not tied to an enemy table: the effect names the type `SPAWNWARNING` in code |

### Pickups (`PICKUPS`, one image each)

| Pickup | Sprite name | Status |
|---|---|---|
| bullets | `Ammo_idle1` | done |
| shells | `Shells_idle1` | done |
| rockets | `Rockets_idle1` | done |
| cells | `Cells_idle1` | done |
| health | `Health_idle1` | done |
| armor | `Armor_idle1` | done |
| invulnerability | `Invuln_idle1` | done |
| radiation suit | `Radsuit_idle1` | done |
| berserk | `Berserk_idle1` | done |
| blue keycard | `Blue_Key_idle1` | done |
| red keycard | `Red_Key_idle1` | done |
| yellow keycard | `Yellow_Key_idle1` | done |
| shotgun | `Shotgun_idle1` | done |
| chaingun | `Chaingun_idle1` | done |
| rocket launcher | `Rocket_Launcher_idle1` | done |
| plasma rifle | `Plasma_Rifle_idle1` | done |
| BFG 9000 | `BFG_9000_idle1` | done |
| chainsaw | `Chainsaw_idle1` | done |

### Decorations (`DECORATIONS`)

| Decoration | Map char | Sprite name | Status |
|---|---|---|---|
| IMPALEDBODY | `t` | `Impaled_Body_idle1` | done, 1 frame |
| SKULLPILE | `j` | `Skull_Pile_idle1` | done, 1 frame |
| CANDELABRA | `u` | `Candelabra_idle1` | done, 1 frame |
| BURNINGBARREL | `k` | `Burning_Barrel_idle1`..`_idle3` | done, 3 frames (animated, loops) |
| REDTORCH | `T` | `Red_Torch_idle1`..`_idle4` | done, 4 frames (animated, loops) |
| TECHLAMP | `U` | `Tech_Lamp_idle1` | done, 1 frame |
| TERMINAL | `1` | `Terminal_idle1`..`_idle3` | done, 3 frames (animated, 200 ms per frame; F on it opens the web Bitburner) |
| STAKEDCORPSE | `X` | `Staked_Corpse_idle1` | done, 1 frame |
| GOREPOLE | `G` | `Gore_Pole_idle1` | done, 1 frame |
| HANGINGBODY1 | `H` | `Hanging_Body_1_idle1` | done, 1 frame |
| HANGINGBODY2 | `J` | `Hanging_Body_2_idle1` | done, 1 frame |
| HANGINGBODY3 | `N` | `Hanging_Body_3_idle1` | done, 1 frame |

### Walls, floor and sky (`FLATS` in `doom.js`)

| Picture | Sprite name | Status |
|---|---|---|
| Walls | `Wall_idle1` | done: 128x128 tileable texture (Freedoom STARTAN1), used by every wall style; `Wall_Stone_idle1` / `Wall_Brick_idle1` / `Wall_Tech_idle1` override it per style |
| Doors | `Door_idle1` | done: 128x128 (Freedoom BIGDOOR2); rises as the door opens; key doors are tinted with their key colour |
| Ceiling | `Ceiling_idle1` | done: 64x64 tileable texture (Freedoom CEIL3_5), drawn with perspective like the floor; used instead of the sky |
| Sky (ceiling) | `Sky_idle1` | done but unused while `Ceiling_idle1` exists (outdoor levels): 1024x256 panorama (Freedoom SKY3), wraps round as you turn, so it must tile sideways |
| Floor | `Floor_idle1` | done: 64x64 tileable texture (Freedoom FLOOR4_8), one copy per map tile, fades to dark with distance |

Any can be left out (a missing floor/ceiling is drawn dark, missing walls stay ASCII); with none, the ASCII look is used. The ceiling picture wins over the sky. Any size works for the sky;
floor and ceiling are shrunk to 64x64 and walls/doors to 128x128 on load, so supply square tileable pictures. Nukage tiles are painted green by the game.

### Still to add

None: every enemy now has art except where noted.

Also optional: more `Pain_Elemental_walk` frames (it has 2).

## How to add a sprite (preferred: the helper script, nothing large is read)

Run from the folder that holds `sprites.json` and `doom.js` (or pass `--json PATH` / `--doom PATH`):

```
python sprites_tool.py add Zombie_walk1 --png zombie_walk1.png    (from a PNG file)
python sprites_tool.py add Zombie_walk1 --b64 zombie_walk1.txt    (from base64 text, with or without data: prefix)
python sprites_tool.py list                                        (check names / collisions / duplicate images)
python sprites_tool.py reference                                   (refresh the table below)
```

`add` keeps the file's exact layout, backs it up to `sprites.json.bak`, refuses duplicate names, typeless names and
`dead`/`die`, checks the data is a real PNG, and warns about slot collisions. Add all frames of one animation with
consecutive numbers starting at 1.

### Manual append (if the script cannot be used)

Do **not** load and re-save the whole JSON (that reformats about 970 KB). Edit the end of the file only. The file currently
ends like this:

```
  "Last_Existing_Name": "....base64....="\r\n
}
```

Change it to (note the comma added after the previous last entry; keep CRLF line endings; no newline after `}`):

```
  "Last_Existing_Name": "....base64....=",
  "New_Sprite_Name": "NEW_BASE64_HERE"
}
```

Afterwards: the file must still parse as JSON, the new key must not already exist, and the new base64 must start with
`iVBORw0KGgo`. Restart the game script to load it (sprites are decoded once at startup). Adding a brand-new enemy
type also needs its entry in `ENEMIES` in `doom.js`, and one with a projectile needs `sprite: 'TYPE'` in its
`PROJECTILES` entry.

## Current sprites (generated by `sprites_tool.py reference`; do not edit by hand)

<!-- SPRITES:START -->
### IMP  (18 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Imp_attack1` | attack | 1 | 49x60 |
| `Imp_attack2` | attack | 2 | 44x55 |
| `Imp_attack3` | attack | 3 | 32x55 |
| `Imp_death1` | die | 1 | 42x60 |
| `Imp_death2` | die | 2 | 41x58 |
| `Imp_death3` | die | 3 | 44x59 |
| `Imp_death4` | die | 4 | 47x59 |
| `Imp_death5` | die | 5 | 55x58 |
| `Imp_death6` | die | 6 | 52x42 |
| `Imp_death7` | die | 7 | 57x42 |
| `Imp_death8` | die | 8 | 57x31 |
| `Imp_death9` | die | 9 | 56x22 |
| `Imp_death10` | die | 10 | 56x18 |
| `Imp_projectile` | idle | 1 | 37x33 |
| `Imp_projectile_impact` | impact | 1 | 43x39 |
| `Imp_walk1` | walk | 1 | 41x57 |
| `Imp_walk2` | walk | 2 | 37x57 |
| `Imp_walk3` | walk | 3 | 39x56 |

### DEMON  (12 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Demon_attack1` | attack | 1 | 44x55 |
| `Demon_attack2` | attack | 2 | 44x55 |
| `Demon_attack3` | attack | 3 | 44x55 |
| `Demon_death1` | die | 1 | 54x56 |
| `Demon_death2` | die | 2 | 60x51 |
| `Demon_death3` | die | 3 | 52x42 |
| `Demon_death4` | die | 4 | 62x38 |
| `Demon_death5` | die | 5 | 64x32 |
| `Demon_death6` | die | 6 | 64x32 |
| `Demon_walk1` | walk | 1 | 43x58 |
| `Demon_walk2` | walk | 2 | 40x56 |
| `Demon_walk3` | walk | 3 | 40x56 |

### CACODEMON  (12 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Cacodemon_attack1` | attack | 1 | 63x65 |
| `Cacodemon_attack2` | attack | 2 | 63x69 |
| `Cacodemon_attack3` | attack | 3 | 63x71 |
| `Cacodemon_death1` | die | 1 | 63x67 |
| `Cacodemon_death2` | die | 2 | 63x67 |
| `Cacodemon_death3` | die | 3 | 65x73 |
| `Cacodemon_death4` | die | 4 | 66x65 |
| `Cacodemon_death5` | die | 5 | 75x49 |
| `Cacodemon_projectile` | idle | 1 | 40x37 |
| `Cacodemon_projectile_impact` | impact | 1 | 50x43 |
| `Cacodemon_walk1` | walk | 1 | 63x66 |
| `Cacodemon_walk2` | walk | 2 | 63x67 |

### LOSTSOUL  (11 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Lost_Soul_attack1` | attack | 1 | 44x42 |
| `Lost_Soul_attack2` | attack | 2 | alias of `Lost_Soul_walk2` |
| `Lost_Soul_death1` | die | 1 | 34x43 |
| `Lost_Soul_death2` | die | 2 | 36x49 |
| `Lost_Soul_death3` | die | 3 | 45x48 |
| `Lost_Soul_death4` | die | 4 | 68x60 |
| `Lost_Soul_death5` | die | 5 | 88x72 |
| `Lost_Soul_projectile` | idle | 1 | 15x15 |
| `Lost_Soul_projectile_impact` | impact | 1 | alias of `Lost_Soul_death5` |
| `Lost_Soul_walk1` | walk | 1 | 44x46 |
| `Lost_Soul_walk2` | walk | 2 | 44x42 |

### CYBERDEMON  (16 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Cyber_Demon_attack1` | attack | 1 | 86x110 |
| `Cyber_Demon_attack2` | attack | 2 | 99x110 |
| `Cyber_Demon_death1` | die | 1 | 122x111 |
| `Cyber_Demon_death2` | die | 2 | 111x113 |
| `Cyber_Demon_death3` | die | 3 | 100x116 |
| `Cyber_Demon_death4` | die | 4 | 110x117 |
| `Cyber_Demon_death5` | die | 5 | 124x124 |
| `Cyber_Demon_death6` | die | 6 | 133x131 |
| `Cyber_Demon_death7` | die | 7 | 131x132 |
| `Cyber_Demon_death8` | die | 8 | 118x30 |
| `Cyber_Demon_projectile` | idle | 1 | 15x14 |
| `Cyber_Demon_projectile_impact` | impact | 1 | 45x48 |
| `Cyber_Demon_walk1` | walk | 1 | 82x108 |
| `Cyber_Demon_walk2` | walk | 2 | 85x109 |
| `Cyber_Demon_walk3` | walk | 3 | 85x109 |
| `Cyber_Demon_walk4` | walk | 4 | 82x110 |

### BARON  (15 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Baron_attack1` | attack | 1 | 48x72 |
| `Baron_attack2` | attack | 2 | 65x70 |
| `Baron_attack3` | attack | 3 | 69x70 |
| `Baron_attack4` | attack | 4 | 53x64 |
| `Baron_death1` | die | 1 | 48x73 |
| `Baron_death2` | die | 2 | 54x64 |
| `Baron_death3` | die | 3 | 56x54 |
| `Baron_death4` | die | 4 | 59x36 |
| `Baron_death5` | die | 5 | 60x30 |
| `Baron_projectile` | idle | 1 | 41x40 |
| `Baron_projectile_impact` | impact | 1 | 49x42 |
| `Baron_walk1` | walk | 1 | 41x73 |
| `Baron_walk2` | walk | 2 | 49x74 |
| `Baron_walk3` | walk | 3 | 41x73 |
| `Baron_walk4` | walk | 4 | 49x74 |

### ZOMBIE  (15 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Zombie_attack1` | attack | 1 | 26x55 |
| `Zombie_attack2` | attack | 2 | 27x55 |
| `Zombie_death1` | die | 1 | 38x55 |
| `Zombie_death2` | die | 2 | 35x46 |
| `Zombie_death3` | die | 3 | 42x34 |
| `Zombie_death4` | die | 4 | 48x22 |
| `Zombie_death5` | die | 5 | 47x17 |
| `Zombie_death6` | die | 6 | 43x60 |
| `Zombie_death7` | die | 7 | 40x59 |
| `Zombie_death8` | die | 8 | 47x59 |
| `Zombie_death9` | die | 9 | 53x38 |
| `Zombie_death10` | die | 10 | 57x33 |
| `Zombie_walk1` | walk | 1 | 37x55 |
| `Zombie_walk2` | walk | 2 | 38x55 |
| `Zombie_walk3` | walk | 3 | 40x55 |

### SPIDERMASTERMIND  (16 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Spider_Mastermind_attack1` | attack | 1 | 194x106 |
| `Spider_Mastermind_attack2` | attack | 2 | 194x106 |
| `Spider_Mastermind_death1` | die | 1 | 179x104 |
| `Spider_Mastermind_death2` | die | 2 | 188x97 |
| `Spider_Mastermind_death3` | die | 3 | 184x89 |
| `Spider_Mastermind_death4` | die | 4 | 182x78 |
| `Spider_Mastermind_death5` | die | 5 | 184x74 |
| `Spider_Mastermind_death6` | die | 6 | 189x70 |
| `Spider_Mastermind_death7` | die | 7 | 192x82 |
| `Spider_Mastermind_death8` | die | 8 | 208x88 |
| `Spider_Mastermind_death9` | die | 9 | 191x109 |
| `Spider_Mastermind_death10` | die | 10 | 184x38 |
| `Spider_Mastermind_walk1` | walk | 1 | 195x110 |
| `Spider_Mastermind_walk2` | walk | 2 | 215x109 |
| `Spider_Mastermind_walk3` | walk | 3 | 195x110 |
| `Spider_Mastermind_walk4` | walk | 4 | 215x109 |

### BARREL  (6 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Barrel_death1` | die | 1 | 40x36 |
| `Barrel_death2` | die | 2 | 56x50 |
| `Barrel_idle1` | idle | 1 | 23x32 |
| `Barrel_idle2` | idle | 2 | 23x32 |
| `Barrel_idle3` | idle | 3 | 23x32 |
| `Barrel_idle4` | idle | 4 | 23x31 |

### BURNINGBARREL  (3 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Burning_Barrel_idle1` | idle | 1 | 34x51 |
| `Burning_Barrel_idle2` | idle | 2 | 36x51 |
| `Burning_Barrel_idle3` | idle | 3 | 32x47 |

### GOREPOLE  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Gore_Pole_idle1` | idle | 1 | 38x66 |

### HANGINGBODY1  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Hanging_Body_1_idle1` | idle | 1 | 30x68 |

### HANGINGBODY2  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Hanging_Body_2_idle1` | idle | 1 | 41x84 |

### HANGINGBODY3  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Hanging_Body_3_idle1` | idle | 1 | 22x85 |

### REDTORCH  (4 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Red_Torch_idle1` | idle | 1 | 24x84 |
| `Red_Torch_idle2` | idle | 2 | 26x81 |
| `Red_Torch_idle3` | idle | 3 | 26x81 |
| `Red_Torch_idle4` | idle | 4 | 26x81 |

### STAKEDCORPSE  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Staked_Corpse_idle1` | idle | 1 | 33x67 |

### TECHLAMP  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tech_Lamp_idle1` | idle | 1 | 23x80 |

### AMMO  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Ammo_idle1` | idle | 1 | 33x12 |

### ARMOR  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Armor_idle1` | idle | 1 | 33x37 |

### BFG9000  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `BFG_9000_idle1` | idle | 1 | 61x36 |

### BERSERK  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Berserk_idle1` | idle | 1 | 25x25 |

### BLUEKEY  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Blue_Key_idle1` | idle | 1 | 17x19 |

### CELLS  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Cells_idle1` | idle | 1 | 32x21 |

### CHAINGUN  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Chaingun_idle1` | idle | 1 | 54x16 |

### CHAINSAW  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Chainsaw_idle1` | idle | 1 | 62x24 |

### HEALTH  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Health_idle1` | idle | 1 | 28x19 |

### INVULN  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Invuln_idle1` | idle | 1 | 26x26 |

### PLASMARIFLE  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Plasma_Rifle_idle1` | idle | 1 | 54x16 |

### RADSUIT  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Radsuit_idle1` | idle | 1 | 24x47 |

### REDKEY  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Red_Key_idle1` | idle | 1 | 16x17 |

### ROCKETLAUNCHER  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Rocket_Launcher_idle1` | idle | 1 | 62x16 |

### ROCKETS  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Rockets_idle1` | idle | 1 | 54x21 |

### SHOTGUN  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Shotgun_idle1` | idle | 1 | 63x12 |

### SHELLS  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Shells_idle1` | idle | 1 | 29x18 |

### YELLOWKEY  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Yellow_Key_idle1` | idle | 1 | 15x18 |

### CRYOBUS  (15 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Cryobus_attack1` | attack | 1 | 84x68 |
| `Cryobus_attack2` | attack | 2 | 83x65 |
| `Cryobus_attack3` | attack | 3 | 87x65 |
| `Cryobus_death1` | die | 1 | 101x75 |
| `Cryobus_death2` | die | 2 | 114x70 |
| `Cryobus_death3` | die | 3 | 104x68 |
| `Cryobus_death4` | die | 4 | 110x59 |
| `Cryobus_death5` | die | 5 | 105x44 |
| `Cryobus_death6` | die | 6 | 105x39 |
| `Cryobus_walk1` | walk | 1 | 73x65 |
| `Cryobus_walk2` | walk | 2 | 88x70 |
| `Cryobus_walk3` | walk | 3 | 82x70 |
| `Cryobus_walk4` | walk | 4 | 73x65 |
| `Cryobus_walk5` | walk | 5 | 88x70 |
| `Cryobus_walk6` | walk | 6 | 82x70 |

### ARCHVILE  (23 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Arch_Vile_attack1` | attack | 1 | 73x93 |
| `Arch_Vile_attack2` | attack | 2 | 79x96 |
| `Arch_Vile_attack3` | attack | 3 | 79x97 |
| `Arch_Vile_attack4` | attack | 4 | 59x80 |
| `Arch_Vile_attack5` | attack | 5 | 55x63 |
| `Arch_Vile_attack6` | attack | 6 | 55x60 |
| `Arch_Vile_attack7` | attack | 7 | 55x60 |
| `Arch_Vile_attack8` | attack | 8 | 54x68 |
| `Arch_Vile_attack9` | attack | 9 | 54x79 |
| `Arch_Vile_attack10` | attack | 10 | 54x89 |
| `Arch_Vile_death1` | die | 1 | 38x80 |
| `Arch_Vile_death2` | die | 2 | 47x76 |
| `Arch_Vile_death3` | die | 3 | 55x70 |
| `Arch_Vile_death4` | die | 4 | 65x58 |
| `Arch_Vile_death5` | die | 5 | 68x47 |
| `Arch_Vile_death6` | die | 6 | 74x37 |
| `Arch_Vile_death7` | die | 7 | 74x25 |
| `Arch_Vile_walk1` | walk | 1 | 32x76 |
| `Arch_Vile_walk2` | walk | 2 | 48x75 |
| `Arch_Vile_walk3` | walk | 3 | 50x75 |
| `Arch_Vile_walk4` | walk | 4 | 32x76 |
| `Arch_Vile_walk5` | walk | 5 | 48x75 |
| `Arch_Vile_walk6` | walk | 6 | 50x75 |

### CANDELABRA  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Candelabra_idle1` | idle | 1 | 29x61 |

### IMPALEDBODY  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Impaled_Body_idle1` | idle | 1 | 39x66 |

### PAINELEMENTAL  (10 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Pain_Elemental_attack1` | attack | 1 | 89x55 |
| `Pain_Elemental_attack2` | attack | 2 | 88x58 |
| `Pain_Elemental_attack3` | attack | 3 | 77x60 |
| `Pain_Elemental_death1` | die | 1 | 76x56 |
| `Pain_Elemental_death2` | die | 2 | 84x56 |
| `Pain_Elemental_death3` | die | 3 | 97x70 |
| `Pain_Elemental_death4` | die | 4 | 87x72 |
| `Pain_Elemental_death5` | die | 5 | 102x86 |
| `Pain_Elemental_walk1` | walk | 1 | 77x57 |
| `Pain_Elemental_walk2` | walk | 2 | 82x57 |

### SKULLPILE  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Skull_Pile_idle1` | idle | 1 | 41x43 |

### TERMINAL  (3 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Terminal_idle1` | idle | 1 | 30x27 |
| `Terminal_idle2` | idle | 2 | 30x27 |
| `Terminal_idle3` | idle | 3 | 30x28 |

### ZOMBIESERGEANT  (10 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Zombie_Sergeant_attack1` | attack | 1 | 26x55 |
| `Zombie_Sergeant_attack2` | attack | 2 | 27x55 |
| `Zombie_Sergeant_death1` | die | 1 | 33x60 |
| `Zombie_Sergeant_death2` | die | 2 | 35x46 |
| `Zombie_Sergeant_death3` | die | 3 | 42x34 |
| `Zombie_Sergeant_death4` | die | 4 | 48x22 |
| `Zombie_Sergeant_death5` | die | 5 | 52x17 |
| `Zombie_Sergeant_walk1` | walk | 1 | 35x55 |
| `Zombie_Sergeant_walk2` | walk | 2 | 32x55 |
| `Zombie_Sergeant_walk3` | walk | 3 | 34x55 |

### SPAWNWARNING  (2 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Spawn_Warning_idle1` | idle | 1 | 23x22 |
| `Spawn_Warning_idle2` | idle | 2 | 7x36 |

### TANKEXPLOSION  (20 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Explosion_idle1` | idle | 1 | 46x42 |
| `Tank_Explosion_idle2` | idle | 2 | 61x58 |
| `Tank_Explosion_idle3` | idle | 3 | 85x70 |
| `Tank_Explosion_idle4` | idle | 4 | 108x77 |
| `Tank_Explosion_idle5` | idle | 5 | 123x91 |
| `Tank_Explosion_idle6` | idle | 6 | 100x107 |
| `Tank_Explosion_idle7` | idle | 7 | 96x82 |
| `Tank_Explosion_idle8` | idle | 8 | 97x86 |
| `Tank_Explosion_idle9` | idle | 9 | 104x80 |
| `Tank_Explosion_idle10` | idle | 10 | 107x73 |
| `Tank_Explosion_idle11` | idle | 11 | 115x68 |
| `Tank_Explosion_idle12` | idle | 12 | 118x67 |
| `Tank_Explosion_idle13` | idle | 13 | 124x64 |
| `Tank_Explosion_idle14` | idle | 14 | 128x65 |
| `Tank_Explosion_idle15` | idle | 15 | 122x62 |
| `Tank_Explosion_idle16` | idle | 16 | 121x55 |
| `Tank_Explosion_idle17` | idle | 17 | 121x57 |
| `Tank_Explosion_idle18` | idle | 18 | 119x53 |
| `Tank_Explosion_idle19` | idle | 19 | 104x36 |
| `Tank_Explosion_idle20` | idle | 20 | 81x32 |

### TANKGUN  (7 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Gun_idle1` | idle | 1 | 16x25 |
| `Tank_Gun_idle2` | idle | 2 | 24x23 |
| `Tank_Gun_idle3` | idle | 3 | 24x16 |
| `Tank_Gun_idle4` | idle | 4 | 23x23 |
| `Tank_Gun_idle5` | idle | 5 | 16x24 |
| `Tank_Gun_idle6` | idle | 6 | 22x23 |
| `Tank_Gun_idle7` | idle | 7 | 24x16 |

### TANKMISSILEGUN  (7 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Missile_Gun_idle1` | idle | 1 | 17x26 |
| `Tank_Missile_Gun_idle2` | idle | 2 | 26x24 |
| `Tank_Missile_Gun_idle3` | idle | 3 | 26x17 |
| `Tank_Missile_Gun_idle4` | idle | 4 | 26x24 |
| `Tank_Missile_Gun_idle5` | idle | 5 | 17x26 |
| `Tank_Missile_Gun_idle6` | idle | 6 | 24x26 |
| `Tank_Missile_Gun_idle7` | idle | 7 | 26x17 |

### TANKPLASMAGUN  (7 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Plasma_Gun_idle1` | idle | 1 | 16x25 |
| `Tank_Plasma_Gun_idle2` | idle | 2 | 24x23 |
| `Tank_Plasma_Gun_idle3` | idle | 3 | 25x16 |
| `Tank_Plasma_Gun_idle4` | idle | 4 | 24x23 |
| `Tank_Plasma_Gun_idle5` | idle | 5 | 16x25 |
| `Tank_Plasma_Gun_idle6` | idle | 6 | 24x23 |
| `Tank_Plasma_Gun_idle7` | idle | 7 | 25x16 |

### TANKSMOKE1  (9 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Smoke_1_idle1` | idle | 1 | 64x64 |
| `Tank_Smoke_1_idle2` | idle | 2 | 64x62 |
| `Tank_Smoke_1_idle3` | idle | 3 | 60x58 |
| `Tank_Smoke_1_idle4` | idle | 4 | 56x54 |
| `Tank_Smoke_1_idle5` | idle | 5 | 48x47 |
| `Tank_Smoke_1_idle6` | idle | 6 | 44x44 |
| `Tank_Smoke_1_idle7` | idle | 7 | 38x39 |
| `Tank_Smoke_1_idle8` | idle | 8 | 34x35 |
| `Tank_Smoke_1_idle9` | idle | 9 | 32x33 |

### TANKSMOKE2  (9 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Smoke_2_idle1` | idle | 1 | 64x64 |
| `Tank_Smoke_2_idle2` | idle | 2 | 64x65 |
| `Tank_Smoke_2_idle3` | idle | 3 | 60x60 |
| `Tank_Smoke_2_idle4` | idle | 4 | 60x61 |
| `Tank_Smoke_2_idle5` | idle | 5 | 56x58 |
| `Tank_Smoke_2_idle6` | idle | 6 | 48x49 |
| `Tank_Smoke_2_idle7` | idle | 7 | 40x42 |
| `Tank_Smoke_2_idle8` | idle | 8 | 38x39 |
| `Tank_Smoke_2_idle9` | idle | 9 | 36x35 |

### TANKSMOKE3  (9 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Smoke_3_idle1` | idle | 1 | 64x64 |
| `Tank_Smoke_3_idle2` | idle | 2 | 66x67 |
| `Tank_Smoke_3_idle3` | idle | 3 | 64x67 |
| `Tank_Smoke_3_idle4` | idle | 4 | 60x63 |
| `Tank_Smoke_3_idle5` | idle | 5 | 56x59 |
| `Tank_Smoke_3_idle6` | idle | 6 | 48x49 |
| `Tank_Smoke_3_idle7` | idle | 7 | 40x40 |
| `Tank_Smoke_3_idle8` | idle | 8 | 36x36 |
| `Tank_Smoke_3_idle9` | idle | 9 | 32x31 |

### TANKSMOKE4  (9 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Tank_Smoke_4_idle1` | idle | 1 | 64x64 |
| `Tank_Smoke_4_idle2` | idle | 2 | 64x62 |
| `Tank_Smoke_4_idle3` | idle | 3 | 60x58 |
| `Tank_Smoke_4_idle4` | idle | 4 | 56x54 |
| `Tank_Smoke_4_idle5` | idle | 5 | 48x47 |
| `Tank_Smoke_4_idle6` | idle | 6 | 44x44 |
| `Tank_Smoke_4_idle7` | idle | 7 | 38x39 |
| `Tank_Smoke_4_idle8` | idle | 8 | 34x35 |
| `Tank_Smoke_4_idle9` | idle | 9 | 32x33 |

### ZOMBIEMISSILETANK  (18 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Zombie_Missile_Tank_attack1` | attack | 1 | 82x78 |
| `Zombie_Missile_Tank_attack2` | attack | 2 | 82x78 |
| `Zombie_Missile_Tank_death1` | die | 1 | 66x71 |
| `Zombie_Missile_Tank_death2` | die | 2 | 66x71 |
| `Zombie_Missile_Tank_death3` | die | 3 | 66x71 |
| `Zombie_Missile_Tank_death4` | die | 4 | 66x71 |
| `Zombie_Missile_Tank_death5` | die | 5 | 66x71 |
| `Zombie_Missile_Tank_death6` | die | 6 | 67x69 |
| `Zombie_Missile_Tank_death7` | die | 7 | 76x50 |
| `Zombie_Missile_Tank_death8` | die | 8 | 78x36 |
| `Zombie_Missile_Tank_death9` | die | 9 | 66x36 |
| `Zombie_Missile_Tank_projectile` | idle | 1 | 15x13 |
| `Zombie_Missile_Tank_projectile_impact1` | impact | 1 | 47x44 |
| `Zombie_Missile_Tank_projectile_impact2` | impact | 2 | 59x51 |
| `Zombie_Missile_Tank_projectile_impact3` | impact | 3 | 64x58 |
| `Zombie_Missile_Tank_walk1` | walk | 1 | 66x71 |
| `Zombie_Missile_Tank_walk2` | walk | 2 | 66x71 |
| `Zombie_Missile_Tank_walk3` | walk | 3 | 66x71 |

### ZOMBIEPLASMATANK  (14 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Zombie_Plasma_Tank_attack1` | attack | 1 | 67x71 |
| `Zombie_Plasma_Tank_attack2` | attack | 2 | 67x71 |
| `Zombie_Plasma_Tank_death1` | die | 1 | 66x71 |
| `Zombie_Plasma_Tank_death2` | die | 2 | 66x71 |
| `Zombie_Plasma_Tank_death3` | die | 3 | 66x71 |
| `Zombie_Plasma_Tank_death4` | die | 4 | 66x71 |
| `Zombie_Plasma_Tank_death5` | die | 5 | 66x70 |
| `Zombie_Plasma_Tank_death6` | die | 6 | 67x69 |
| `Zombie_Plasma_Tank_death7` | die | 7 | 76x50 |
| `Zombie_Plasma_Tank_death8` | die | 8 | 78x36 |
| `Zombie_Plasma_Tank_death9` | die | 9 | 66x36 |
| `Zombie_Plasma_Tank_walk1` | walk | 1 | 66x71 |
| `Zombie_Plasma_Tank_walk2` | walk | 2 | 66x71 |
| `Zombie_Plasma_Tank_walk3` | walk | 3 | 66x71 |

### ZOMBIETANK  (14 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Zombie_Tank_attack1` | attack | 1 | 66x71 |
| `Zombie_Tank_attack2` | attack | 2 | 66x71 |
| `Zombie_Tank_death1` | die | 1 | 66x71 |
| `Zombie_Tank_death2` | die | 2 | 66x71 |
| `Zombie_Tank_death3` | die | 3 | 66x71 |
| `Zombie_Tank_death4` | die | 4 | 66x71 |
| `Zombie_Tank_death5` | die | 5 | 66x70 |
| `Zombie_Tank_death6` | die | 6 | 67x69 |
| `Zombie_Tank_death7` | die | 7 | 76x50 |
| `Zombie_Tank_death8` | die | 8 | 78x36 |
| `Zombie_Tank_death9` | die | 9 | 66x36 |
| `Zombie_Tank_walk1` | walk | 1 | 66x71 |
| `Zombie_Tank_walk2` | walk | 2 | 66x71 |
| `Zombie_Tank_walk3` | walk | 3 | 66x71 |

### SKY  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Sky_idle1` | idle | 1 | 1024x256 |

### FLOOR  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Floor_idle1` | idle | 1 | 64x64 |

### CEILING  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Ceiling_idle1` | idle | 1 | 64x64 |

### WALL  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Wall_idle1` | idle | 1 | 128x128 |

### DOOR  (1 sprites)

| Key | Animation | Frame | Size (px) / note |
|---|---|---|---|
| `Door_idle1` | idle | 1 | 128x128 |
<!-- SPRITES:END -->
