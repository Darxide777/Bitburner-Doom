/**
 * If you don't have singularity access then you'll need 64 GB 
 * ram on home server to run this, otherwise it's less than 5GB.
 * 
 * DOOM — Bitburner Edition
 * E1M1: Hangar
 *
 * CONTROLS:
 *   W/↑        Move Forward
 *   S/↓        Move Backward
 *   A/←        Turn Left
 *   D/→        Turn Right
 *   Q/E        Strafe Left/Right
 *   F          Use Door
 *   SPACE      Shoot
 *   1          Switch to Pistol
 *   2          Switch to Shotgun
 *   3          Switch to Chaingun
 *   Tab        Toggle Minimap
 *   ESC        Quit
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');

  // ─── AUTO UPDATE ─────────────────────────────────────────────────────────
  const VERSION = '8';
  const GIST_ID = '8c7dccdb1cf489cb37f7a8c4cb478f3a';
  const GIST_FILE = 'Doom.js';
  //const RAW_URL = `https://gist.githubusercontent.com/Darxide111/8c7dccdb1cf489cb37f7a8c4cb478f3a/raw/Doom.js`;
  const API_URL = `https://api.github.com/gists/${GIST_ID}`;

  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const remote = data.files[GIST_FILE].content;
    const match = remote.match(/const VERSION = '([^']+)'/);
    const remoteVersion = match ? match[1] : null;

    if (remoteVersion && remoteVersion !== VERSION) {
      ns.tprint(`UPDATE: New version ${remoteVersion} available. Updating...`);
      await ns.write('doom.js', remote, 'w');
      ns.tprint('Update complete. Restarting...');
      ns.exec('doom.js', 'home');
      return;
    }
  } catch (e) {
    // fail silently, run current version
  }

  // ─── MAP ────────────────────────────────────────────────────────────────────

  const raw = ns.read('map.txt');
  const MAP = raw.split('\n').filter(line => line.length > 0).map(r => r.trimEnd());
  const MH = MAP.length;
  const MW = Math.max(...MAP.map(r => r.length));

  // ─── DOOR STATE ─────────────────────────────────────────────────────────────
  const doorState = {};
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (MAP[y][x] === 'D' || MAP[y][x] === 'K') {
        if (!doorState[y]) doorState[y] = {};
        doorState[y][x] = false; // false = closed
      }
    }
  }

  // Secret walls: track which have been "found" (opened)
  const secretFound = {};

  function rawAt(fx, fy) {
    const mx = Math.floor(fx), my = Math.floor(fy);
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) return '#';
    return MAP[my][mx];
  }

  function mapAt(fx, fy) {
    const mx = Math.floor(fx), my = Math.floor(fy);
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) return '#';
    const ch = MAP[my][mx];
    if (ch === 'D' || ch === 'K') return (doorState[my]?.[mx]) ? '.' : '#';
    if (ch === '6') return '#';
    if (ch === 'S') return (secretFound[`${my},${mx}`]) ? '.' : '#';
    if (ch === 'B') return '.'; // boss spawn is walkable
    if ('zicdly'.includes(ch)) return '.';
    return ch;
  }

  // ─── CONSTANTS ──────────────────────────────────────────────────────────────
  const W = 90, H = 24;
  const FOV = 1.2;
  const SHADES = ' .:-=+xX$@#█';
  const FLOOR_CHARS = ".,'▒";
  const FACES = { normal: '}:)', hit: '>:(', lowHp: '}:o', dead: 'x:(' };

  // ─── WEAPONS ────────────────────────────────────────────────────────────────
  const WEAPONS = {
    pistol: { name: 'PISTOL', ammoPerShot: 1, cooldown: 10, spread: 0, damage: 1, pellets: 1, color: '#aaa' },
    shotgun: { name: 'SHOTGUN', ammoPerShot: 2, cooldown: 22, spread: 0.08, damage: 1, pellets: 7, color: '#fa0' },
    chaingun: { name: 'CHAINGUN', ammoPerShot: 1, cooldown: 4, spread: 0.04, damage: 1, pellets: 1, color: '#0ff' },
  };
  let currentWeapon = 'pistol';

  // ─── GAME STATE ─────────────────────────────────────────────────────────────

  let px = 1.5, py = 1.5, pa = -Math.PI / 2; // defaults, overwritten below
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (MAP[y][x] === 'P') { px = x + 0.5; py = y + 0.5; }
    }
  }
  let health = 100, ammo = 50, kills = 0, score = 0;
  let hasBlueKey = false;
  let gameOver = false, won = false, showMap = false;
  let flashMsg = '', flashTimer = 0;
  let shootCooldown = 0, useCooldown = 0;
  let hitFlash = 0;       // red screen overlay frames
  let muzzleFlash = 0;    // yellow muzzle flash frames
  let damageNumbers = []; // {x, y, val, ttl, screenX, screenY}
  let secretsFound = 0;
  let gameStartTime = Date.now();
  const projectiles = [];

  // ─── PICKUPS ────────────────────────────────────────────────────────────────
  const pickups = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const ch = MAP[y][x];
      if (ch === 'a') pickups.push({ x: x + 0.5, y: y + 0.5, type: 'ammo', alive: true });
      if (ch === 'h') pickups.push({ x: x + 0.5, y: y + 0.5, type: 'health', alive: true });
      if (ch === 'b') pickups.push({ x: x + 0.5, y: y + 0.5, type: 'bluekey', alive: true });
      if (ch === 't') pickups.push({ x: x + 15, y: y + 5, type: 'floortile', alive: true });
      // Secret room reward
      if (ch === 'S') pickups.push({ x: x + 0.5, y: y + 1.5, type: 'health', alive: true, secret: true });
    }
  }

  // ─── ENEMY SPAWN ────────────────────────────────────────────────────────────────

  const ENEMY_TYPES = {
    'z': { type: 'ZOMBIE', hp: 1, maxHp: 1 },
    'i': { type: 'IMP', hp: 2, maxHp: 2 },
    'd': { type: 'DEMON', hp: 4, maxHp: 4 },
    'c': { type: 'CACODEMON', hp: 6, maxHp: 6 },
    'l': { type: 'LOSTSOUL', hp: 1, maxHp: 1 },
    'Y': { type: 'CYBERDEMON', hp: 30, maxHp: 30, phase: 0, chargeTimer: 0, lastLauncher: 0 },
  };

  const enemies = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const ch = MAP[y][x];
      if (ENEMY_TYPES[ch]) {
        const def = ENEMY_TYPES[ch];
        enemies.push({ x: x + 0.5, y: y + 0.5, spawnX: x + 0.5, spawnY: y + 0.5, alive: true, ...def });
      }
    }
  }

  // ─── DOM SETUP ──────────────────────────────────────────────────────────────
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

  const pre = doc.createElement('pre');
  pre.style.cssText = 'margin:0;white-space:pre;color:#0c0;position:relative;';
  root.appendChild(pre);

  const hud = doc.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;border-top:1px solid #400;margin-top:6px;padding-top:4px;font-size:11px;flex-wrap:wrap;gap:4px;';
  hud.innerHTML = `
    <span>❤️ HP: <span id="d-hp" style="color:#e00">100</span></span>
    <span>🔫 <span id="d-wpn" style="color:#aaa">PISTOL</span></span>
    <span>⭐ AMMO: <span id="d-ammo" style="color:#e00">50</span></span>
    <span>💀 KILLS: <span id="d-kills" style="color:#e00">0</span></span>
    <span>🏆 SCORE: <span id="d-score" style="color:#e00">0</span></span>
    <span id="d-key" style="color:#444">NO KEY</span>
    <span style="color:#666">1=Pistol 2=Shotgun 3=Chaingun • WASD • F Use • Tab Map</span>
    <span id="d-pos" style="color:#0cc">X:0.0 Y:0.0</span>`
    ;
  root.appendChild(hud);

  const face = doc.createElement('div');
  face.style.cssText = 'font-size:40px;letter-spacing:-2px;margin-bottom:6px;transform:rotate(-90deg);display:inline-block;visibility:hidden;';
  face.innerHTML = '<span id="d-face">}:)</span>';
  root.insertBefore(face, hud);

  doc.body.appendChild(root);
  root.focus();

  // Steal focus from terminal — it re-grabs after the run command finishes,
  // so we defer a couple of attempts to win the race.
  const termInput = doc.querySelector('.terminal-input');
  if (termInput) termInput.blur();
  setTimeout(() => { if (termInput) termInput.blur(); root.focus(); }, 100);
  setTimeout(() => { if (termInput) termInput.blur(); root.focus(); }, 300);

  // Re-steal focus any time the user clicks anywhere in the document,
  // in case the terminal or another element grabs it mid-game.
  const refocusHandler = () => { if (running) root.focus(); };
  doc.addEventListener('click', refocusHandler);

  // ─── INPUT ──────────────────────────────────────────────────────────────────
  const keys = {};
  function onKey(e) {
    if (e.type === 'keydown') {
      keys[e.key] = true;
      if (e.key === 'Escape') { e.preventDefault(); running = false; }
      if (e.key === 'Tab') { showMap = !showMap; e.preventDefault(); }
      if (e.key === '1') currentWeapon = 'pistol';
      if (e.key === '2') currentWeapon = 'shotgun';
      if (e.key === '3') currentWeapon = 'chaingun';
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
        'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
        'q', 'e', 'Q', 'E', 'f', 'F',
        '1', '2', '3', 'Tab', 'Escape'].includes(e.key))
        e.preventDefault();
    } else {
      keys[e.key] = false;
    }
  }
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('keyup', onKey);

  let running = true;
  function cleanup() {
    running = false;
    try { musicSrc.stop(); } catch (e) { }
    root.remove();
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('keyup', onKey);
    doc.removeEventListener('click', refocusHandler);
  }

  // ─── HUD UPDATE ─────────────────────────────────────────────────────────────
  function updateHud() {
    const g = id => root.querySelector('#' + id);
    g('d-hp').textContent = Math.floor(health);
    g('d-ammo').textContent = ammo;
    g('d-kills').textContent = kills;
    g('d-score').textContent = score;
    const wpnEl = g('d-wpn');
    const wpn = WEAPONS[currentWeapon];
    wpnEl.textContent = wpn.name;
    wpnEl.style.color = wpn.color;
    const keyEl = g('d-key');
    if (hasBlueKey) { keyEl.style.color = '#44f'; keyEl.textContent = 'BLUE KEY'; }
    g('d-pos').textContent = `X:${px.toFixed(1)} Y:${py.toFixed(1)}`;
  }

  // ─── AUDIO ──────────────────────────────────────────────────────────────────
  const audioCtx = new (eval('window').AudioContext || eval('window').webkitAudioContext)();
  const audioData = JSON.parse(ns.read("audio.json"));

  const SFX_HURT = `data:audio/wav;base64,${audioData.playerinjured}`;
  const SFX_PISTOL = `data:audio/wav;base64,${audioData.pistol}`;
  const SFX_DOOR = `data:audio/wav;base64,${audioData.door}`;
  const SFX_SHOTGUN = `data:audio/wav;base64,${audioData.shotgun}`;
  const SFX_DemonDeath = `data:audio/wav;base64,${audioData.demondeath}`;
  const SFX_ZombieInjured = `data:audio/wav;base64,${audioData.zombieinjured}`;
  const SFX_CacodemonDeath = `data:audio/wav;base64,${audioData.cacodemondeath}`;
  const SFX_ImpAttack = `data:audio/wav;base64,${audioData.impattack}`;
  const SFX_CyberDemonDeath = `data:audio/wav;base64,${audioData.cyberdemondeath}`;
  const SFX_LostSoulInjured = `data:audio/wav;base64,${audioData.lostsoulinjured}`;
  const SFX_LostSoulDeath = `data:audio/wav;base64,${audioData.lostsouldeath}`;
  const SFX_DemonInjured = `data:audio/wav;base64,${audioData.demoninjured}`;
  const SFX_DemonAttack = `data:audio/wav;base64,${audioData.demonattack}`;
  const SFX_CacodemonInjured = `data:audio/wav;base64,${audioData.cacodemoninjured}`;
  const SFX_ImpInjured = `data:audio/wav;base64,${audioData.impinjured}`;
  const SFX_ZombieDeath = `data:audio/wav;base64,${audioData.zombiedeath}`;
  const SFX_CyberdemonAttack = `data:audio/wav;base64,${audioData.cyberdemonattack}`;
  const SFX_CyberdemonInjured = `data:audio/wav;base64,${audioData.cyberdemoninjured}`;
  const SFX_CacodemonAttack = `data:audio/wav;base64,${audioData.cacodemonattack}`;
  const SFX_LevelTheme = `data:audio/wav;base64,${audioData.level}`;
  const SFX_ImpDeath = `data:audio/wav;base64,${audioData.impdeath}`;
  const SFX_LostsoulsAttack = `data:audio/wav;base64,${audioData.lostsoulattack}`;
  const SFX_PlayerDeath = `data:audio/wav;base64,${audioData.playerdeath}`;


  async function loadSound(dataUrl) {
    const response = await fetch(dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  }

  function playSound(buffer, volume = 1.0) {
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
  }

  // ─── RAYCASTING ─────────────────────────────────────────────────────────────
  function castRay(angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let rx = px, ry = py;
    for (let i = 0; i < 120; i++) {
      rx += dx * 0.08; ry += dy * 0.08;
      if (mapAt(rx, ry) === '#') return Math.sqrt((rx - px) ** 2 + (ry - py) ** 2);
    }
    return 100;
  }

  function hasLineOfSight(ex, ey, tx, ty) {
    const dx = tx - ex, dy = ty - ey;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(dist / 0.08);
    for (let i = 0; i < steps; i++) {
      const rx = ex + (dx / dist) * i * 0.08;
      const ry = ey + (dy / dist) * i * 0.08;
      if (mapAt(rx, ry) === '#') return false;
    }
    return true;
  }

  function projectSprite(sx, sy) {
    const dx = sx - px, dy = sy - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 20 || dist < 0.3) return null;
    const angle = Math.atan2(dy, dx) - pa;
    const norm = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (Math.abs(norm) > FOV / 2 + 0.2) return null;
    const screenX = Math.round((norm / FOV + 0.5) * W);
    const h = Math.min(H, Math.round(H / dist * 2.4));
    return { screenX, dist, h };
  }

  // ─── USE / INTERACT ─────────────────────────────────────────────────────────
  function tryUse() {
    const fx = px + Math.cos(pa) * 1.3, fy = py + Math.sin(pa) * 1.3;
    const mx = Math.floor(fx), my = Math.floor(fy);
    const raw = rawAt(fx, fy);
    if (raw === 'D' || raw === 'K') {
      if (raw === 'K' && !hasBlueKey) {
        flashMsg = 'NEED BLUE KEYCARD!';
        flashTimer = 25;
        return;
      }
      if (!doorState[my]) doorState[my] = {};
      const wasClosed = !doorState[my][mx];
      doorState[my][mx] = !doorState[my][mx];
      flashMsg = wasClosed ? (raw === 'K' ? 'KEY DOOR OPENED' : 'DOOR OPENED') : 'DOOR CLOSED';
      flashTimer = 25;
      playSound(doorBuffer, 0.8);
    }

  }

  // ─── SHOOT ──────────────────────────────────────────────────────────────────
  function shoot() {
    const wpn = WEAPONS[currentWeapon];
    if (ammo < wpn.ammoPerShot || shootCooldown > 0) return;
    ammo -= wpn.ammoPerShot;
    shootCooldown = wpn.cooldown;
    muzzleFlash = 4;
    const sfx = currentWeapon === 'shotgun' ? shotgunBuffer : pistolBuffer;
    playSound(sfx, currentWeapon === 'chaingun' ? 0.6 : 1.0);

    for (let p = 0; p < wpn.pellets; p++) {
      const spreadAngle = pa + (Math.random() - 0.5) * wpn.spread;
      const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
      let rx = px, ry = py;
      for (let i = 0; i < 100; i++) {
        rx += dx * 0.15; ry += dy * 0.15;
        if (mapAt(rx, ry) === '#') break;
        let hit = false;
        for (const e of enemies) {
          if (!e.alive) continue;
          if (Math.abs(e.x - rx) < 0.6 && Math.abs(e.y - ry) < 0.6) {
            e.hp -= wpn.damage;
            // hurt sound
            if (e.hp > 0) {
              const hurtSfx = e.type === 'ZOMBIE' ? zombieInjuredBuffer :
                e.type === 'IMP' ? impInjuredBuffer :
                  e.type === 'DEMON' ? demonInjuredBuffer :
                    e.type === 'CACODEMON' ? cacodemonInjuredBuffer :
                      e.type === 'LOSTSOUL' ? lostSoulInjuredBuffer :
                        e.type === 'CYBERDEMON' ? cyberdemonInjuredBuffer : null;
              if (hurtSfx) playSound(hurtSfx, 0.7);
            }
            if (e.hp <= 0) {
              e.alive = false; kills++;
              const deathSfx = e.type === 'ZOMBIE' ? zombieDeathBuffer :
                e.type === 'IMP' ? impDeathBuffer :
                  e.type === 'DEMON' ? demonDeathBuffer :
                    e.type === 'CACODEMON' ? cacodemonDeathBuffer :
                      e.type === 'LOSTSOUL' ? lostSoulDeathBuffer :
                        e.type === 'CYBERDEMON' ? cyberDemonDeathBuffer : null;
              if (deathSfx) playSound(deathSfx, 1.0);

            }
            // Spawn damage number
            const sp = projectSprite(e.x, e.y);
            if (sp) damageNumbers.push({ screenX: sp.screenX, screenY: Math.floor((H - sp.h) / 2) - 1, val: wpn.damage, ttl: 20 });
            if (e.hp <= 0) {
              e.alive = false; kills++;
              const pts = e.type === 'CYBERDEMON' ? 5000 : e.type === 'DEMON' ? 200 : e.type === 'CACODEMON' ? 300 : e.type === 'IMP' ? 100 : e.type === 'LOSTSOUL' ? 75 : 50;
              score += pts;
              flashMsg = e.type === 'CYBERDEMON' ? '★★ CYBERDEMON SLAIN ★★' :
                e.type === 'CACODEMON' ? '** CACODEMON DEAD **' :
                  e.type === 'DEMON' ? '** DEMON SLAIN **' :
                    e.type === 'IMP' ? '* IMP KILLED *' :
                      e.type === 'LOSTSOUL' ? '* LOST SOUL DESTROYED *' : '- ZOMBIE DOWN -';
              flashTimer = 30;
            }
            hit = true; break;
          }
        }
        if (hit) break;
      }
    }
    updateHud();
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  function renderFrame() {
    const wallDist = new Float32Array(W);
    const wallH = new Int32Array(W);

    for (let x = 0; x < W; x++) {
      const angle = pa + (x / W - 0.5) * FOV;
      wallDist[x] = castRay(angle);
      wallH[x] = Math.min(H + 12, Math.round(H / (wallDist[x] * 0.82)));
    }

    const grid = [];
    for (let y = 0; y < H; y++) grid[y] = new Array(W).fill(' ');

    // Walls + floor/ceiling
    for (let x = 0; x < W; x++) {
      const h = wallH[x], d = wallDist[x];
      const angle = pa + (x / W - 0.5) * FOV;
      const top = Math.max(0, Math.floor((H - h) / 2));
      const shadeIndex = Math.max(0, Math.min(SHADES.length - 1, Math.floor(d * 1.45)));
      const rayX = px + Math.cos(angle) * d;
      const rayY = py + Math.sin(angle) * d;
      const mapChar = rawAt(rayX, rayY);
      const isDoor = mapChar === 'D' || mapChar === 'K';
      const isHellWin = mapChar === '6';
      const isSecret = mapChar === 'S';

      for (let y = 0; y < H; y++) {
        if (y < top || y >= top + h) {
          grid[y][x] = ' ';
        }
        else {
          if (isHellWin) {
            const rayX = px + Math.cos(angle) * wallDist[x];
            const rayY = py + Math.sin(angle) * wallDist[x];
            const u = (Math.abs(Math.floor(rayX) - rayX) > Math.abs(Math.floor(rayY) - rayY))
              ? (rayX % 1 + 1) % 1
              : (rayY % 1 + 1) % 1;
            const v = (y - top) / h;
            const onV = u > 0.42 && u < 0.58;
            const onH = v > 0.42 && v < 0.58;
            const borderV = u > 0.35 && u < 0.65;
            const borderH = v > 0.35 && v < 0.65;
            if (onV || onH) {
              grid[y][x] = '\x0D█';
            } else if ((borderV && Math.abs(u - 0.5) > 0.42) ||
              (borderH && Math.abs(v - 0.5) > 0.42) ||
              (borderV && borderH)) {
              grid[y][x] = '\x0E█';
            } else if (borderV || borderH) {
              grid[y][x] = '\x0E█';
            } else {
              grid[y][x] = '\x14█';
            }
          } else if (isDoor) {
            grid[y][x] = d < 2.5 ? '\x0C+' : '\x0C|';
          } else if (isSecret) {
            grid[y][x] = d < 2.2 ? '#' : SHADES[Math.max(0, shadeIndex - 1)];
          } else {
            grid[y][x] = d < 2.2 ? '#' : SHADES[shadeIndex];
          }
        }
      }
    }
    // ── Sprites ─────────────────────────────────────────────────────────────
    const sprites = [];
    for (const e of enemies) if (e.alive) {
      const s = projectSprite(e.x, e.y);
      if (s && hasLineOfSight(px, py, e.x, e.y)) sprites.push({ kind: 'enemy', obj: e, s });
    }
    for (const p of pickups) if (p.alive) {
      const s = projectSprite(p.x, p.y); if (s) sprites.push({ kind: 'pickup', obj: p, s });
    }
    for (const p of projectiles) if (p.alive) {
      const s = projectSprite(p.x, p.y); if (s) sprites.push({ kind: 'projectile', obj: p, s });
    }
    sprites.sort((a, b) => b.s.dist - a.s.dist);

    for (const { kind, obj, s } of sprites) {
      const { screenX, dist, h } = s;
      let sprite, sw, tag = '\x00';
      let sh = h;
      if (kind === 'enemy') {
        if (obj.type === 'CYBERDEMON') {
          const charging = obj.chargeTimer > 0;
          const blinkOn = Math.floor(Date.now() / 150) % 2;
          const t = Math.floor(Date.now() / 400) % 2;
          const L = (charging && blinkOn && obj.lastLauncher === 0) ? '!' : 'R';
          const R = (charging && blinkOn && obj.lastLauncher === 1) ? '!' : 'R';
          const hurt = obj.hp < obj.maxHp / 2;
          const eyes = hurt ? (blinkOn ? `   [*]  [*]  ` : `   [x]  [x]  `) : `   [o]  [o]  `;
          sprite = t ? [
            `  ⣠⣾⣿⣿⣾⣄  `,
            `)>⣿⣿⣿⣿⣿⣿<(`,
            eyes,
            `  [▄▄▄▄▄▄▄] `,
            `╔═╗|▓▓▓▓▓|╔═╗`,
            `║${L}║|▓▓▓▓▓|║${R}║`,
            `╚═╝|▓▓▓▓▓|╚═╝`,
            ` ▐██▌ ▐██▌  `,
            ` ▐██▌ ▐██▌  `,
            ` ▐█▌  ▐██▌  `,
          ] : [
            `  ⣠⣾⣿⣿⣾⣄  `,
            `)>⣿⣿⣿⣿⣿⣿<(`,
            eyes,
            `  [▄▄▄▄▄▄▄] `,
            `╔═╗|▓▓▓▓▓|╔═╗`,
            `║${L}║|▓▓▓▓▓|║${R}║`,
            `╚═╝|▓▓▓▓▓|╚═╝`,
            ` ▐██▌ ▐██▌  `,
            ` ▐██▌ ▐██▌  `,
            ` ▐██▌  ▐█▌  `,
          ]; sw = 13; sh = 10; tag = '\x0F';
        }
        else if (obj.type === 'CACODEMON') {
          const t = Math.floor(Date.now() / 400) % 2;
          const angry = obj.hp < obj.maxHp / 2;
          if (angry) {
            sprite = [
              `/\\⣾⣿⣿⣿⣿/\\`,
              `⣼⣿⣿⣿⣿⣿⣿⣧`,
              `⣿⣿(◄▀►)⣿⣿`,
              `⠿⣿⣿⣿⣿⣿⣿⠿`,
              `⠻⣿/▄▄▄▄\\⠟`,
              `⠀⠙⠿⣿⣿⠿⠙⠀`,
            ];
          } else {
            sprite = t ? [
              `/\\⣾⣿⣿⣿⣿/\\`,
              `⣼⣿⣿⣿⣿⣿⣿⣧`,
              `⣿⣿(◄ ►)⣿⣿`,
              `⠿⣿⣿⣿⣿⣿⣿⠿`,
              `⠻⣿/▄▄▄▄\\⠟`,
              `⠀⠙⠿⣿⣿⠿⠙⠀`,
            ] : [
              `/\\⣾⣿⣿⣿⣿/\\`,
              `⣼⣿⣿⣿⣿⣿⣿⣧`,
              `⣿⣿( ◄► )⣿⣿`,
              `⠿⣿⣿⣿⣿⣿⣿⠿`,
              `⠻⣿/▄▄▄▄\\⠟`,
              `⠀⠙⠿⣿⣿⠿⠙⠀`,
            ];
          }
          sw = 10; sh = 6; tag = '\x10';
        } else if (obj.type === 'LOSTSOUL') {
          const t = Math.floor(Date.now() / 200) % 2;
          sprite = t ? [
            ` ▲▲▲ `,
            `(o o)`,
            ` \\▄/ `,
          ] : [
            `      `,
            `(o o)`,
            ` \\▄/ `,
          ];
          sw = 6; sh = 3; tag = '\x03';
        } else if (obj.type === 'DEMON') {
          const t = Math.floor(Date.now() / 300) % 2;
          sprite = t ? [
            `⣾/\\⣿⣿/\\⣷`,
            `⣿(@@@@)⣿`,
            `⣿[▄▄▄▄]⣿`,
            `⣿ /▌▐\\ ⣿`,
          ] : [
            `⣾/\\⣿⣿/\\⣷`,
            `⣿(@@@@)⣿`,
            `⣿[▄▄▄▄]⣿`,
            `⣿ /▐▌\\ ⣿`,
          ];
          sw = 10; sh = 4; tag = '\x15';

        } else if (obj.type === 'IMP') {
          const t = Math.floor(Date.now() / 300) % 2;
          const hurt = obj.hp < obj.maxHp / 2;
          sprite = t ? [
            ` /\\^/\\ `,
            `⣿(${hurt ? 'x x' : 'o o'})⣿`,
            `⣿\\▄▄/⣿`,
            ` /▌▐\\ `,  // frame 1
          ] : [
            ` /\\^/\\ `,
            `⣿(${hurt ? 'x x' : 'o o'})⣿`,
            `⣿\\▄▄/⣿`,
            ` /▐▌\\ `,  // frame 2
          ];
          sw = 8; sh = 4; tag = '\x00';

        } else {
          const t = Math.floor(Date.now() / 400) % 2;
          const hurt = obj.hp < obj.maxHp / 2;
          sprite = t ? [
            ` ⣠⣾⣄ `,
            `(>${hurt ? 'x x' : '- -'}<)`,
            `⣿\\▄▄/⣿`,
            ` ⣿||⣿ `,
            ` /▌▐\\ `,
          ] : [
            ` ⣠⣾⣄ `,
            `(>${hurt ? 'x x' : '- -'}<)`,
            `⣿\\▄▄/⣿`,
            ` ⣿||⣿ `,
            ` /▐▌\\ `,
          ];
          sw = 8; sh = 5; tag = '\x00';
        }
      } else if (kind === 'projectile') {
        if (obj.type === 'fireball') {
          sprite = ['▪']; sw = 1; sh = 1; tag = '\x03';
        } else if (obj.type === 'skull') {
          sprite = ['✦']; sw = 1; sh = 1; tag = '\x03';
        } else if (obj.type === 'pellet') {
          sprite = ['·']; sw = 1; sh = 1; tag = '\x0E';
        } else {
          sprite = ['●']; sw = 1; sh = 1; tag = '\x0D';
        }


      } else {
        if (obj.type === 'ammo') { sprite = ['[=]']; sw = 3; sh = 1; tag = '\x04'; }
        else if (obj.type === 'health') { sprite = ['+H+']; sw = 3; sh = 1; tag = '\x05'; }
        else if (obj.type === 'floortile') {
          sprite = [
            `///////////////`,
            `//::::::::::://`,
            `//::::::::::://`,
            `//::::::::::://`,
            `///////////////`,]; sw = 15; sh = 5; tag = '\x19';
        }
        else { sprite = ['[K]']; sw = 3; sh = 1; tag = '\x06'; }
      }
      for (let sy = 0; sy < sprite.length; sy++) {
        const gy = Math.floor((H - sh) / 2) + Math.round(sy * sh / sprite.length);
        if (gy < 0 || gy >= H) continue;
        for (let sx = 0; sx < sw; sx++) {
          const gx = screenX - Math.floor(sw / 2) + sx;
          if (gx < 0 || gx >= W) continue;
          const ch = [...sprite[sy]][sx];
          if (ch && ch !== ' ' && ch !== '\u3000') {
            if (wallDist[gx] > dist || dist < 2.0) grid[gy][gx] = tag + ch;
          }
        }
      }
    }

    // ── Crosshair + muzzle flash ────────────────────────────────────────────
    const cy = Math.floor(H / 2), cx = Math.floor(W / 2);
    grid[cy][cx] = '\x01+';
    if (muzzleFlash > 0 || shootCooldown > 4) {
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
      if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
        grid[gy][gx] = '\x11' + dn.val;
      }
    }

    // ── Weapon sprite ───────────────────────────────────────
    const wpn = WEAPONS[currentWeapon];
    let gunSprite;
    const gunAnim = shootCooldown > wpn.cooldown * 0.6;
    if (currentWeapon === 'pistol') {
      gunSprite = gunAnim ? ['  |  ', ' /P\\ '] : ['  _  ', ' /P\\ '];
    } else if (currentWeapon === 'shotgun') {
      gunSprite = gunAnim ? [' ||| ', '/SGN\\'] : [' === ', '/SGN\\'];
    } else {
      gunSprite = gunAnim ? [' ||| ', '/CHN\\', '====='] : [' === ', '/CHN\\', '====='];
    }
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
      const scale = 1;
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

          const raw = MAP[my][mx];
          let ch = ' ', colorTag = '\x07';
          if (raw === '#' || raw === '6') ch = '#';
          else if (raw === 'D') ch = doorState[my]?.[mx] ? '/' : '+';
          else if (raw === 'K') { ch = doorState[my]?.[mx] ? '/' : 'K'; colorTag = '\x08'; }
          else if (raw === 'E') { ch = 'E'; colorTag = '\x0B'; }
          else if (raw === 'B') ch = '.';
          else if ('.abh'.includes(raw)) ch = '.';
          grid[gy][gx] = colorTag + ch;
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

    // ── Draw to DOM ─────────────────────────────────────────────────────────
    // Color for hit flash overlay
    if (hitFlash > 0) {
      const alpha = (hitFlash / 10) * 0.35;
      root.style.background = `rgba(180,0,0,${alpha})`;
    } else {
      root.style.background = '#000';
    }

    pre.innerHTML = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let ch = grid[y][x] || ' ';
        if (ch === ' ') { pre.appendChild(doc.createTextNode(' ')); continue; }
        let color = null, text = ch;

        const ctrl = ch[0];
        if (ctrl === '\x00') { color = '#e33'; text = ch.slice(1); }  // enemy
        else if (ctrl === '\x01') { color = '#ff0'; text = ch.slice(1); }  // crosshair
        else if (ctrl === '\x03') { color = '#ff0'; text = ch.slice(1); }  // muzzle
        else if (ctrl === '\x04') { color = '#fa0'; text = ch.slice(1); }  // ammo
        else if (ctrl === '\x05') { color = '#0f0'; text = ch.slice(1); }  // health
        else if (ctrl === '\x06') { color = '#44f'; text = ch.slice(1); }  // key
        else if (ctrl === '\x07') { color = '#555'; text = ch.slice(1); }  // map wall
        else if (ctrl === '\x08') { color = '#88f'; text = ch.slice(1); }  // blue door
        else if (ctrl === '\x0A') { color = '#0f0'; text = ch.slice(1); }  // player arrow
        else if (ctrl === '\x0B') { color = '#ff0'; text = ch.slice(1); }  // exit
        else if (ctrl === '\x0C') { color = '#888'; text = ch.slice(1); }  // door
        else if (ctrl === '\x0D') { color = '#f00'; text = ch.slice(1); }  // hell window / rocket
        else if (ctrl === '\x0E') { color = '#aaa'; text = ch.slice(1); } //pellet grey
        else if (ctrl === '\x0F') { color = '#708090'; text = ch.slice(1); }  // cyberdemon
        else if (ctrl === '\x10') { color = '#f00'; text = ch.slice(1); }  // cacodemon
        else if (ctrl === '\x11') { color = '#ff4'; text = ch.slice(1); }  // damage number
        else if (ctrl === '\x12') { color = '#888'; text = ch.slice(1); }  // gun sprite
        else if (ctrl === '\x13') { color = '#0ff'; text = ch.slice(1); }  // secret on map
        else if (ctrl === '\x14') { color = '#fff'; text = ch.slice(1); }
        else if (ctrl === '\x15') { color = '#f48'; text = ch.slice(1); }  // demon pink
        else if (ctrl === '\x16') { color = '#666'; text = ch.slice(1); }  // floor close
        else if (ctrl === '\x17') { color = '#444'; text = ch.slice(1); }  // floor mid
        else if (ctrl === '\x18') { color = '#222'; text = ch.slice(1); }  // floor far
        else if (ctrl === '\x19') { color = '#fff'; text = ch.slice(1); }  // floor tile
        else if (ch === '\u00b7') { color = '#333'; }
        else if (FLOOR_CHARS.includes(ch)) { color = '#444'; }

        if (color) {
          const span = doc.createElement('span');
          span.style.color = color;
          span.textContent = text;
          pre.appendChild(span);
        } else {
          pre.appendChild(doc.createTextNode(text));
        }
      }
      pre.appendChild(doc.createTextNode('\n'));
    }

    // Flash message
    if (flashTimer > 0 && flashMsg) {
      const msg = doc.createElement('div');
      const isSecret = flashMsg.includes('SECRET');
      const isBoss = flashMsg.includes('CYBER');
      msg.style.cssText = `position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);
        color:${isBoss ? '#f44' : isSecret ? '#0ff' : '#f00'};
        font-size:${isBoss ? '20px' : '18px'};font-weight:bold;pointer-events:none;
        text-shadow:0 0 8px currentColor;`;
      msg.textContent = flashMsg;
      pre.appendChild(msg);
    }
  }

  // ─── TITLE SCREEN ───────────────────────────────────────────────────────────
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
    ['WASD Move  Q/E Strafe  F Use  SPACE Shoot  1/2/3 Weapon  Tab Map', '#555'],
  ];

  function renderTitleScreen(blink) {
    pre.innerHTML = '';
    for (const [text, color] of TITLE_LINES) {
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
  function renderEndScreen(victory) {
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    pre.innerHTML = '';
    const lines = victory ? [
      ['', null],
      ['  ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★  ', '#ff0'],
      ['', null],
      ['         LEVEL COMPLETE!          ', '#0f0'],
      ['', null],
      [`         E1M1: HANGAR             `, '#0f0'],
      ['', null],
      [`  Time:    ${mm}:${ss}             `, '#aaa'],
      [`  Kills:   ${kills} / ${enemies.length}         `, '#aaa'],
      [`  Secrets: ${secretsFound} / 1                `, '#aaa'],
      [`  Score:   ${score}                `, '#ff0'],
      ['', null],
      ['  ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★  ', '#ff0'],
      ['', null],
      ['      PRESS ESC TO EXIT           ', '#555'],
    ] : [
      ['', null],
      ['  ██████████████████████████████  ', '#600'],
      ['', null],
      ['            YOU DIED              ', '#f00'],
      ['', null],
      [`  Time:    ${mm}:${ss}             `, '#666'],
      [`  Kills:   ${kills} / ${enemies.length}         `, '#666'],
      [`  Secrets: ${secretsFound} / 1                `, '#666'],
      [`  Score:   ${score}                `, '#666'],
      ['', null],
      ['  ██████████████████████████████  ', '#600'],
      ['', null],
      ['      PRESS ESC TO EXIT           ', '#555'],
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
  hud.style.display = 'none';
  let onTitle = true, blinkState = true, blinkCounter = 0;
  while (onTitle && running) {
    blinkCounter++;
    if (blinkCounter % 12 === 0) blinkState = !blinkState;
    renderTitleScreen(blinkState);
    if (keys['Enter'] || keys[' ']) onTitle = false;
    await ns.sleep(50);
    if (!running) break;
  }
  keys['Escape'] = false; keys['Enter'] = false; keys[' '] = false;
  if (!running) { cleanup(); return; }

  const hurtBuffer = await loadSound(SFX_HURT);
  const doorBuffer = await loadSound(SFX_DOOR);
  const pistolBuffer = await loadSound(SFX_PISTOL);
  const shotgunBuffer = await loadSound(SFX_SHOTGUN);
  const demonDeathBuffer = await loadSound(SFX_DemonDeath);
  const zombieInjuredBuffer = await loadSound(SFX_ZombieInjured);
  const cacodemonDeathBuffer = await loadSound(SFX_CacodemonDeath);
  const impAttackBuffer = await loadSound(SFX_ImpAttack);
  const cyberDemonDeathBuffer = await loadSound(SFX_CyberDemonDeath);
  const lostSoulInjuredBuffer = await loadSound(SFX_LostSoulInjured);
  const lostSoulDeathBuffer = await loadSound(SFX_LostSoulDeath);
  const demonInjuredBuffer = await loadSound(SFX_DemonInjured);
  const demonAttackBuffer = await loadSound(SFX_DemonAttack);
  const cacodemonInjuredBuffer = await loadSound(SFX_CacodemonInjured);
  const impInjuredBuffer = await loadSound(SFX_ImpInjured);
  const zombieDeathBuffer = await loadSound(SFX_ZombieDeath);
  const cyberdemonAttackBuffer = await loadSound(SFX_CyberdemonAttack);
  const cyberdemonInjuredBuffer = await loadSound(SFX_CyberdemonInjured);
  const cacodemonAttackBuffer = await loadSound(SFX_CacodemonAttack);
  const impDeathBuffer = await loadSound(SFX_ImpDeath);
  const lostSoulAttackBuffer = await loadSound(SFX_LostsoulsAttack);
  const playerDeathBuffer = await loadSound(SFX_PlayerDeath);
  const levelThemeBuffer = await loadSound(SFX_LevelTheme);

  //Music Loop

  const musicSrc = audioCtx.createBufferSource();
  musicSrc.buffer = levelThemeBuffer;
  musicSrc.loop = true;
  const musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.4;
  musicSrc.connect(musicGain);
  musicGain.connect(audioCtx.destination);
  musicSrc.start();

  gameStartTime = Date.now();
  hud.style.display = 'flex';
  face.style.visibility = 'visible';

  // ─── MAIN GAME LOOP ─────────────────────────────────────────────────────────
  const SPEED = 0.07, TURN = 0.065, STRAFE_SPEED = 0.065;

  while (running) {
    if (!gameOver && !won) {
      // ── Input ──────────────────────────────────────────────────────────────
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) pa -= TURN;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) pa += TURN;
      let nx = px, ny = py;
      if (keys['ArrowUp'] || keys['w'] || keys['W']) { nx += Math.cos(pa) * SPEED; ny += Math.sin(pa) * SPEED; }
      if (keys['ArrowDown'] || keys['s'] || keys['S']) { nx -= Math.cos(pa) * SPEED; ny -= Math.sin(pa) * SPEED; }
      if (keys['q'] || keys['Q']) { nx += Math.cos(pa - Math.PI / 2) * STRAFE_SPEED; ny += Math.sin(pa - Math.PI / 2) * STRAFE_SPEED; }
      if (keys['e'] || keys['E']) { nx += Math.cos(pa + Math.PI / 2) * STRAFE_SPEED; ny += Math.sin(pa + Math.PI / 2) * STRAFE_SPEED; }

      const passable = ch => '.aEhbBGP'.includes(ch);
      if (passable(mapAt(nx, py))) px = nx;
      if (passable(mapAt(px, ny))) py = ny;
      // ── Player/Enemy collision ─────────────────────────────────────────────
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = px - e.x, dy = py - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 0.7;
        if (dist < minDist && dist > 0) {
          const push = (minDist - dist) / dist;
          px += dx * push * 0.5;
          py += dy * push * 0.5;
        }
      }

      if ((keys['f'] || keys['F']) && useCooldown <= 0) { tryUse(); useCooldown = 12; }
      if (useCooldown > 0) useCooldown--;
      if (keys[' ']) shoot();
      if (shootCooldown > 0) shootCooldown--;
      if (muzzleFlash > 0) muzzleFlash--;

      // Decay damage numbers
      damageNumbers = damageNumbers.filter(d => d.ttl-- > 0);

      // ── Projectiles ────────────────────────────────────────────────────────
      for (const p of projectiles) {
        if (!p.alive) continue;
        p.x += p.dx; p.y += p.dy;
        p.ttl--;
        if (p.ttl <= 0 || mapAt(p.x, p.y) === '#') { p.alive = false; continue; }
        if (Math.abs(p.x - px) < 0.4 && Math.abs(p.y - py) < 0.4) {
          p.alive = false;
          health = Math.max(0, health - (p.damage || 1));
          hitFlash = 6;
          playSound(hurtBuffer, 0.5);
          root.querySelector('#d-face').textContent = health <= 0 ? FACES.dead : health < 30 ? FACES.lowHp : FACES.hit;
          setTimeout(() => { if (health > 0) root.querySelector('#d-face').textContent = health < 30 ? FACES.lowHp : FACES.normal; }, 500);
          flashMsg = health < 30 ? 'CRITICAL!' : 'HIT!';
          flashTimer = 20;
          updateHud();
          if (health <= 0) { gameOver = true; flashMsg = 'YOU DIED'; flashTimer = 9999; playSound(playerDeathBuffer, 1.0); }
        }
      }
      projectiles.splice(0, projectiles.length, ...projectiles.filter(p => p.alive));

      // ── Pickups ────────────────────────────────────────────────────────────
      for (const p of pickups) {
        if (!p.alive) continue;
        if (Math.abs(p.x - px) < 0.7 && Math.abs(p.y - py) < 0.7) {
          p.alive = false;
          if (p.type === 'ammo') { ammo = Math.min(99, ammo + 20); flashMsg = '+20 AMMO'; }
          if (p.type === 'health') { health = Math.min(100, health + 25); flashMsg = '+25 HEALTH'; }
          if (p.type === 'bluekey') { hasBlueKey = true; flashMsg = 'BLUE KEYCARD ACQUIRED!'; }
          flashTimer = 25;
          updateHud();
        }
      }

      // ── Exit check ─────────────────────────────────────────────────────────
      if (rawAt(px, py) === 'E') {
        won = true; score += 1000;
        flashMsg = 'E1M1 COMPLETE! +1000'; flashTimer = 9999;
        updateHud();
      }

      // ── Enemy AI ───────────────────────────────────────────────────────────────
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = px - e.x, dy = py - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sightRange = e.type === 'CYBERDEMON' ? 25 : e.type === 'CACODEMON' ? 16 : 12;

        const spawnDist = Math.sqrt((e.x - e.spawnX) ** 2 + (e.y - e.spawnY) ** 2);
        const maxRoam = e.type === 'CYBERDEMON' ? 18 : 8;

        if (dist < sightRange && spawnDist < maxRoam && hasLineOfSight(e.x, e.y, px, py)) {
          let spd;
          if (e.type === 'CYBERDEMON') {
            const spawnDist = Math.sqrt((e.x - e.spawnX) ** 2 + (e.y - e.spawnY) ** 2);
            if (dist < 25 && spawnDist < 18 && hasLineOfSight(e.x, e.y, px, py)) {
              const spd = 0.009 + (1 - e.hp / e.maxHp) * 0.008;
              const enx = e.x + (dx / dist) * spd, eny = e.y + (dy / dist) * spd;
              const r = 0.35;
              if (mapAt(enx + r, e.y) !== '#' && mapAt(enx - r, e.y) !== '#' &&
                mapAt(enx, e.y + r) !== '#' && mapAt(enx, e.y - r) !== '#') e.x = enx;
              if (mapAt(e.x + r, eny) !== '#' && mapAt(e.x - r, eny) !== '#' &&
                mapAt(e.x, eny + r) !== '#' && mapAt(e.x, eny - r) !== '#') e.y = eny;

              // charge and fire
              if (e.chargeTimer > 0) {
                e.chargeTimer--;
                if (e.chargeTimer === 0) {
                  const angle = Math.atan2(py - e.y, px - e.x);
                  playSound(cyberdemonAttackBuffer, 1.0);
                  projectiles.push({
                    x: e.x, y: e.y,
                    dx: Math.cos(angle) * 0.14,
                    dy: Math.sin(angle) * 0.14,
                    alive: true, ttl: 80, damage: 18,
                    type: 'rocket'
                  });
                  e.lastLauncher = e.lastLauncher === 0 ? 1 : 0;
                }
              } else if (Math.random() < 0.02 && hasLineOfSight(e.x, e.y, px, py)) {
                e.chargeTimer = 30;
              }
            }
            continue;
          }
          else if (e.type === 'CACODEMON') spd = 0.008;
          else if (e.type === 'DEMON') spd = 0.016;
          else spd = 0.011;

          const enx = e.x + (dx / dist) * spd, eny = e.y + (dy / dist) * spd;
          const r = 0.35;
          if (mapAt(enx + r, e.y) !== '#' && mapAt(enx - r, e.y) !== '#' &&
            mapAt(enx, e.y + r) !== '#' && mapAt(enx, e.y - r) !== '#') e.x = enx;
          if (mapAt(e.x + r, eny) !== '#' && mapAt(e.x - r, eny) !== '#' &&
            mapAt(e.x, eny + r) !== '#' && mapAt(e.x, eny - r) !== '#') e.y = eny;
        }

        if (e.type === 'LOSTSOUL') {
          if (dist < 8 && Math.random() < 0.035 && hasLineOfSight(e.x, e.y, px, py)) {
            const angle = Math.atan2(py - e.y, px - e.x);
            playSound(lostSoulAttackBuffer, 0.7);
            projectiles.push({
              x: e.x, y: e.y,
              dx: Math.cos(angle) * 0.18,
              dy: Math.sin(angle) * 0.18,
              alive: true, ttl: 50, damage: 1,
              type: 'skull'
            });
          }
          continue;
        }

        // Attack
        // Imp fireball
        if (e.type === 'IMP') {
          if (dist < 10 && dist > 1.5 && Math.random() < 0.02 && hasLineOfSight(e.x, e.y, px, py)) {
            playSound(impAttackBuffer, 0.7);
            const angle = Math.atan2(py - e.y, px - e.x);
            projectiles.push({
              x: e.x, y: e.y,
              dx: Math.cos(angle) * 0.15,
              dy: Math.sin(angle) * 0.15,
              alive: true, ttl: 40, damage: 4,
              type: 'fireball'
            });
          }
        }

        if (e.type === 'ZOMBIE') {
          if (dist < 12 && dist > 1.5 && Math.random() < 0.015 && hasLineOfSight(e.x, e.y, px, py)) {
            playSound(shotgunBuffer, 0.6);
            for (let i = 0; i < 5; i++) {
              const spread = (Math.random() - 0.5) * 0.2;
              const angle = Math.atan2(py - e.y, px - e.x) + spread;
              projectiles.push({
                x: e.x, y: e.y,
                dx: Math.cos(angle) * 0.16,
                dy: Math.sin(angle) * 0.16,
                alive: true, ttl: 45, damage: 2,
                type: 'pellet'
              });
            }
          }
        }

        const atkRange = e.type === 'CYBERDEMON' ? 1.5 : 0.8;
        const atkRate = e.type === 'CYBERDEMON' ? 0.04 : e.type === 'CACODEMON' ? 0.025 : 0.018;
        if (dist < atkRange && Math.random() < atkRate && hasLineOfSight(e.x, e.y, px, py)) {
          const atkSfx = e.type === 'CACODEMON' ? cacodemonAttackBuffer :
            e.type === 'DEMON' ? demonAttackBuffer :
              e.type === 'CYBERDEMON' ? cyberdemonAttackBuffer : null;
          if (atkSfx) playSound(atkSfx, 0.8);
          const dmg = e.type === 'CYBERDEMON' ? 20 : e.type === 'CACODEMON' ? 8 : e.type === 'DEMON' ? 9 : e.type === 'IMP' ? 6 : 4;
          health = Math.max(0, health - dmg);
          playSound(hurtBuffer, 0.8);
          hitFlash = 10;
          root.querySelector('#d-face').textContent = health <= 0 ? FACES.dead : health < 30 ? FACES.lowHp : FACES.hit;
          setTimeout(() => { if (health > 0) root.querySelector('#d-face').textContent = health < 30 ? FACES.lowHp : FACES.normal; }, 500);
          flashMsg = e.type === 'CYBERDEMON' ? `CYBERDEMON HIT! -${dmg}` : health < 30 ? 'CRITICAL!' : 'HIT!';
          flashTimer = 20;
          updateHud();
          if (health <= 0) { gameOver = true; flashMsg = 'YOU DIED'; flashTimer = 9999; playSound(playerDeathBuffer, 1.0); }
        }
      }

      if (hitFlash > 0) hitFlash--;
      if (flashTimer > 0) flashTimer--;

    } else {
      // End screen
      renderEndScreen(won);
      await ns.sleep(40);
      continue;
    }

    renderFrame();
    updateHud();
    await ns.sleep(40);
  }

  cleanup();
}
