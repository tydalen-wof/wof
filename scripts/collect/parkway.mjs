// Plymouth Parkway's own fixtures page (SportsPress table). Parkway fixtures only.
// The date/time in each row is UK wall-clock time as the club publishes it.
import { getText } from '../lib/http.mjs';
import { stripTags, decodeEntities } from '../lib/html.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';

export const NAME = 'Plymouth Parkway website';
export const META = { id: 'parkway', name: NAME, url: 'https://www.ppfc.co.uk/fixtures/', postponements: true };
export const CLUB = 'Plymouth Parkway';

export function parseParkway(html) {
  const out = [];
  for (const row of html.split(/<tr class="sp-row/).slice(1)) {
    const dt = /datetime="(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(row);
    const title = /sp-event-title[^>]*>\s*<a[^>]*>([^<]*)/.exec(row)?.[1];
    if (!dt || !title) continue;
    const parts = decodeEntities(title).split(/\s+v\s+/i);
    if (parts.length !== 2) continue;
    const league = /sp-event-league">([^<]*)/.exec(row)?.[1]?.trim() ?? '';
    const venues = [...row.matchAll(/PostalAddress">([^<]*)/g)].map(m => decodeEntities(m[1]).trim()).filter(v => v && !/^n\/a$/i.test(v));
    const shown = stripTags(/sp-event-results[\s\S]*?<\/h5>/.exec(row)?.[0] ?? '');
    out.push({
      date: dt[1], time: /tbc|tba/i.test(shown) ? null : dt[2], home: parts[0].trim(), away: parts[1].trim(),
      venue: venues[0] ?? null, league, postponed: looksPostponed(shown) || /postpone/i.test(title),
    });
  }
  return out;
}

export async function collect() {
  try {
    const rows = parseParkway(await getText(META.url));
    if (!rows.length) throw new Error('no fixtures found in page (layout may have changed)');
    const mk = (r, competition, tag) => makeFixture({
      date: r.date, time: r.time, home: r.home, away: r.away, venue: r.venue, competition, tag,
      status: r.postponed ? 'postponed' : 'scheduled', source: NAME,
    });
    const isLeague = r => /southern league/i.test(r.league);
    const league = rows.filter(isLeague).map(r => mk(r, 'Southern League Premier South', null));
    const other = rows.filter(r => !isLeague(r)).map(r => mk(r, r.league || 'Cup', r.league || null));
    const res = result(META, { fixtures: league, complete: false });
    res.scope = f => f.home === CLUB || f.away === CLUB;      // only Parkway's own games are covered
    res.partialNote = 'Plymouth Parkway games only';
    res.cupTies = other;                                       // non-league games (cups) for the club
    return res;
  } catch (e) { return failure(META, e); }
}
