/** @param {NS} ns */
export async function main(ns) {
  const REPO_USER = 'Darxide777';
  const REPO_NAME = 'Bitburner-Doom';
  const BRANCH = 'main';
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/${BRANCH}`;

  // doom.js first, then the data it reads. Extra level maps are downloaded by the game itself on its first run.
  const FILES = [
    ['doom.js', ''],
    ['map.txt', ''],
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

  const version = (ns.read('doom.js').match(/const VERSION = '([^']+)'/) || [])[1];
  ns.tprint(`Installation complete${version ? ` (version ${version})` : ''}! Run doom.js to play.`);
}
