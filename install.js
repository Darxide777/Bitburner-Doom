/** @param {NS} ns */
export async function main(ns) {
  const REPO_USER = 'Darxide777';
  const REPO_NAME = 'Bitburner-Doom';
  const BRANCH = 'main';
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/${BRANCH}`;

  // doom.js first, then the data it reads (every level's map file is listed here). Any other `map: 'file.txt'` in doom.js's LEVELS is also added below.
  // Run this again whenever the game prints "New version available": it replaces every file listed here.
  const FILES = [
    ['doom.js', ''],
    ['map.txt', ''],
    ['map_rooms.txt', ''],
    ['map_arena.txt', ''],
    ['audio.json', ' (this may take a moment)'],
    ['sprites.json', ' (this may take a moment)'],
  ];

  ns.tprint('Installing Bitburner Doom...');

  for (const [file, note] of FILES) {
    ns.tprint(`Downloading ${file}...${note}`);
    let ok = false;
    try {
      // ns.wget does not throw when a download fails: it returns false
      ok = await ns.wget(`${RAW_BASE}/${file}`, file);
    } catch (e) {
      ns.tprint(`ERROR: ${e}`);
    }
    if (!ok) {
      ns.tprint(`ERROR: could not download ${file}. Installation stopped; run install.js again to retry.`);
      return;
    }
  }

  // Extra level maps named in the freshly downloaded doom.js (optional: a missing one is skipped, not fatal)
  for (const m of ns.read('doom.js').matchAll(/\bmap: '([^']+)'/g)) {
    if (!/\.txt$/.test(m[1]) || FILES.some(f => f[0] === m[1])) continue;
    ns.tprint(`Downloading ${m[1]}...`);
    try { if (!(await ns.wget(`${RAW_BASE}/${m[1]}`, m[1]))) ns.tprint(`Skipped ${m[1]} (could not download)`); } catch (e) { ns.tprint(`Skipped ${m[1]}: ${e}`); }
  }

  const version = (ns.read('doom.js').match(/const VERSION = '([^']+)'/) || [])[1];
  ns.tprint(`Installation complete${version ? ` (version ${version})` : ''}! Run doom.js to play.`);
}
