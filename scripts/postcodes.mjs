// Maintain data/postcodes.json by hand.
//   node scripts/postcodes.mjs add "Holyhead Hotspur" "LL65 2YE" --venue "The New Oval" --source "club website" --note "..."
//   node scripts/postcodes.mjs missing          teams that have no postcode yet
//   node scripts/postcodes.mjs show "Team"      one team's entry
// `add` refuses to change a stored postcode unless --replace is given.
import { pathToFileURL } from 'node:url';
import { loadLookup, saveLookup, addEntry, LOOKUP_PATH } from './lib/postcodes.mjs';
import { londonToday } from './lib/time.mjs';

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--replace') opt.replace = true;
    else if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

export function main(argv, { path = LOOKUP_PATH, log = console.log } = {}) {
  const [cmd, ...rest] = argv;
  const { pos, opt } = parse(rest);
  const lookup = loadLookup(path);
  if (cmd === 'add') {
    const [team, postcode] = pos;
    if (!team || !postcode) throw new Error('usage: add "Team" "AB1 2CD" [--venue ..] [--source ..] [--note ..] [--replace]');
    const e = addEntry(lookup, { team, postcode, venue: opt.venue, source: opt.source ?? 'added by hand', note: opt.note, replace: opt.replace, today: londonToday() });
    saveLookup(lookup, path);
    log(`${team}: ${e.postcode}${e.venue ? ` (${e.venue})` : ''}`);
  } else if (cmd === 'missing') {
    const names = Object.entries(lookup.teams).filter(([, e]) => !e.postcode).map(([n, e]) => `${n}${e.venue ? ` (${e.venue})` : ''}`);
    log(names.length ? names.join('\n') : 'Every stored team has a postcode.');
    log(`${names.length} of ${Object.keys(lookup.teams).length} teams still need one.`);
  } else if (cmd === 'show') {
    log(JSON.stringify(lookup.teams[pos[0]] ?? null, null, 2));
  } else {
    throw new Error('commands: add | missing | show');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
