// Lookup of known non-league home grounds and their postcodes (data/postcodes.json).
//   - Read on every build. A known postcode is shown on that team's home games; a known ground fills a missing venue.
//   - The build adds each non-league home team it sees that is not in the file yet (postcode: null), so the file is also
//     a to-do list. It never overwrites a value that is already stored.
//   - No source publishes postcodes, so they are entered by hand when discovered: node scripts/postcodes.mjs add ...
//   - A postcode is never guessed. Where none is stored, a followed club's home game shows "Postcode not found".
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { teamKey, makeResolver, sameVenue } from './teams.mjs';

export const LOOKUP_PATH = 'data/postcodes.json';
export const NOT_FOUND = 'Postcode not found';
const COMMENT = 'Known non-league home grounds. Add a postcode with: node scripts/postcodes.mjs add "Team" "AB1 2CD" --source "where you found it". '
  + 'The build adds teams it has seen (postcode null) and never overwrites a stored value. "caveat" is shown in the report notes.';

/** "ll65 2ye" / "LL652YE" -> "LL65 2YE"; null if it is not a valid UK postcode shape. */
export function normalisePostcode(s) {
  const t = String(s ?? '').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(t)) return null;
  return `${t.slice(0, -3)} ${t.slice(-3)}`;
}

export function emptyLookup() { return { _comment: COMMENT, teams: {} }; }

export function loadLookup(path = LOOKUP_PATH) {
  if (!existsSync(path)) return emptyLookup();
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return { _comment: j._comment ?? COMMENT, teams: j.teams ?? {} };
}

/** Stable output (teams sorted, fields in a fixed order) so changes show up cleanly in git. Written atomically. */
export function saveLookup(lookup, path = LOOKUP_PATH) {
  const order = ['venue', 'postcode', 'source', 'added', 'caveat'];
  const teams = {};
  for (const name of Object.keys(lookup.teams).sort((a, b) => a.localeCompare(b))) {
    const e = lookup.teams[name];
    const out = {};
    for (const k of order) if (e[k] !== undefined) out[k] = e[k];
    for (const k of Object.keys(e)) if (!order.includes(k)) out[k] = e[k];
    teams[name] = out;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify({ _comment: lookup._comment ?? COMMENT, teams }, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}

/** find(team) -> { name, entry } | null. Exact or alias match only: a different club is never matched by prefix. */
export function makeFinder(lookup, aliases = {}) {
  const resolve = makeResolver(Object.keys(lookup.teams), aliases, { prefix: false });
  return team => { const name = resolve(team); return name ? { name, entry: lookup.teams[name] } : null; };
}

/** Records a discovered postcode. Refuses to replace a different stored one unless `replace` is set. */
export function addEntry(lookup, { team, postcode, venue, source, note, replace = false, today }) {
  const pc = normalisePostcode(postcode);
  if (!pc) throw new Error(`"${postcode}" is not a valid UK postcode`);
  const have = lookup.teams[team];
  if (have?.postcode && have.postcode !== pc && !replace) {
    throw new Error(`${team} already has ${have.postcode}. Use --replace to change it.`);
  }
  lookup.teams[team] = {
    ...have,
    venue: venue ?? have?.venue ?? null,
    postcode: pc,
    ...(source ? { source } : {}),
    ...(today ? { added: today } : {}),
    ...(note ? { caveat: note } : {}),
  };
  return lookup.teams[team];
}

const keyOf = f => `${f.date}|${f.home}|${f.away}`;

/**
 * Applies the lookup to one section.
 *   show      show postcodes in this section
 *   nonLeague every club here is non-league, so a followed club with no postcode says "Postcode not found"
 *   record    add unseen home teams to the lookup (venue only if recordVenue: it is a league ground, not a cup venue)
 * Returns the venue-filled fixtures, a map of fixture key -> text to show, notes, and entries to add or complete.
 */
export function applyLookup({ fixtures, followed = [], finder, show, nonLeague = false, record = false, recordVenue = false, cup = false }) {
  const followedKeys = new Set(followed.map(teamKey));
  const postcodes = {};
  const notes = new Set();
  const additions = new Map();      // team -> { team, venue }
  const venueFills = new Map();     // stored name -> venue (an entry that has none yet)
  const missing = new Set();
  const mismatches = [];
  let filled = 0;

  const out = fixtures.map(f => {
    const hit = finder(f.home);
    let venue = f.venue;
    if (show && !venue && hit?.entry.venue) { venue = hit.entry.venue; filled++; }

    if (show) {
      let text = null;
      if (hit?.entry.postcode) {
        if (f.venue && hit.entry.venue && !sameVenue(f.venue, hit.entry.venue)) {
          mismatches.push(`${f.home} v ${f.away}: the feed names the ground "${f.venue}" but the stored ground for ${f.home} is "${hit.entry.venue}", so no postcode is shown.`);
        } else {
          text = hit.entry.postcode;
          if (hit.entry.caveat) notes.add(hit.entry.caveat);
        }
      } else if (followedKeys.has(teamKey(f.home)) && (nonLeague || hit)) {
        text = NOT_FOUND;
      }
      if (text) postcodes[keyOf(f)] = text;
      if (nonLeague && !hit?.entry.postcode) missing.add(hit?.name ?? f.home);
    }

    if (record) {
      if (!hit) { if (!additions.has(teamKey(f.home))) additions.set(teamKey(f.home), { team: f.home, venue: recordVenue ? (f.venue ?? null) : null }); }
      else if (recordVenue && !hit.entry.venue && f.venue) venueFills.set(hit.name, f.venue);
    }
    return venue === f.venue ? f : { ...f, venue };
  });

  for (const m of mismatches) notes.add(m);
  if (show && cup && filled) notes.add(`${filled} venue(s) come from the stored home grounds (data/postcodes.json). A cup tie is not always played at the home club's usual ground.`);
  return { fixtures: out, postcodes, notes: [...notes], additions: [...additions.values()], venueFills: [...venueFills], missing: [...missing].sort((a, b) => a.localeCompare(b)) };
}

/** Adds new teams and fills empty venues. Never overwrites a stored value. Returns how many entries changed. */
export function mergeAdditions(lookup, { additions, venueFills }, today) {
  let changed = 0;
  for (const { team, venue } of additions) {
    if (lookup.teams[team]) continue;
    lookup.teams[team] = { venue: venue ?? null, postcode: null, source: 'seen in a fixture feed', added: today };
    changed++;
  }
  for (const [name, venue] of venueFills) {
    if (lookup.teams[name] && !lookup.teams[name].venue) { lookup.teams[name].venue = venue; changed++; }
  }
  return changed;
}
