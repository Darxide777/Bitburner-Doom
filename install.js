/** @param {NS} ns */
export async function main(ns) {
  const REPO_USER = 'Darxide111';
  const REPO_NAME = 'Bitburner-Doom';
  const BRANCH = 'main';
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/${BRANCH}`;

  ns.tprint('Installing Bitburner Doom...');

  try {
    ns.tprint('Downloading doom.js...');
    await ns.wget(`${RAW_BASE}/doom.js`, 'doom.js');

    ns.tprint('Downloading map.txt...');
    await ns.wget(`${RAW_BASE}/map.txt`, 'map.txt');

    ns.tprint('Downloading audio.json... (this may take a moment)');
    await ns.wget(`${RAW_BASE}/audio.json`, 'audio.json');

    ns.tprint('Installation complete! Run doom.js to play.');
  } catch(e) {
    ns.tprint(`ERROR: Installation failed — ${e}`);
  }
}
