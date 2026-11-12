// ESPN schedule pages. The page embeds its data as JSON (window['__espnfitt__']).
// ESPN shows kick-offs in US Eastern ("Sat, November 14th at 12:00 pm GMT-05:00"); the event also carries a UTC
// instant, which is used when present. The Eastern text is converted to UK time only as a fallback.
// A default page lists only some match days, so `covers` is exactly the days it shows.
import { getText } from '../lib/http.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';
import { fromET, isoToUk, monthNumber } from '../lib/time.mjs';

export const NAME = 'ESPN';
export const PAGES = {
  'uefa.nations': 'https://www.espn.co.uk/football/schedule/_/league/uefa.nations',
  'fifa.friendly': 'https://www.espn.co.uk/football/schedule/_/league/fifa.friendly',
};

/** "Sat, November 14th at 12:00 pm GMT-05:00" (Eastern) -> UK { date, time }. Year comes from the caller. */
export function parseEasternDetail(detail, year) {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(detail ?? '');
  if (!m) return null;
  const month = monthNumber(m[1]);
  if (!month) return null;
  let hh = +m[3] % 12;
  if (m[5].toLowerCase() === 'pm') hh += 12;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
  return fromET(date, `${String(hh).padStart(2, '0')}:${m[4]}`);
}

export function parseEspn(html) {
  const m = html.match(/window\['__espnfitt__'\]\s*=\s*(\{.*?\});?<\/script>/s);
  if (!m) throw new Error('page data not found (layout may have changed)');
  const content = JSON.parse(m[1])?.page?.content;
  const days = content?.events;
  if (!days || typeof days !== 'object') throw new Error('no events in page data');
  const fixtures = [];
  const covers = new Set();
  for (const [key, events] of Object.entries(days)) {
    let allMatchKey = true;
    const keyDate = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
    for (const e of events ?? []) {
      const comps = e.competitors ?? [];
      const home = comps.find(c => c.isHome)?.displayName, away = comps.find(c => c.isHome === false)?.displayName;
      if (!home || !away) continue;
      let uk = e.date ? isoToUk(e.date) : null;
      if (!uk) uk = parseEasternDetail(e.status?.detail, key.slice(0, 4));
      if (!uk) continue;
      if (uk.date !== keyDate) allMatchKey = false;
      const time = e.tbd || e.timeValid === false ? null : uk.time;
      fixtures.push(makeFixture({
        date: uk.date, time, home, away, venue: e.venue?.fullName ?? null,
        competition: 'ESPN', status: looksPostponed(e.status?.detail) || e.status?.state === 'postponed' ? 'postponed' : 'scheduled',
        source: NAME,
      }));
    }
    if (allMatchKey) covers.add(keyDate);
  }
  return { fixtures, covers };
}

export async function collect(slug) {
  const url = PAGES[slug];
  const meta = { id: 'espn-' + slug, name: NAME, url, postponements: true };
  try {
    const { fixtures, covers } = parseEspn(await getText(url));
    return result(meta, { fixtures, covers, complete: false });
  } catch (e) { return failure(meta, e); }
}

/** Merge several ESPN pages into one cross-check source. */
export function merge(results) {
  const ok = results.filter(r => r.ok);
  if (!ok.length) return { ...results[0], error: results.map(r => r.error).join('; ') };
  const covers = new Set(ok.flatMap(r => [...(r.covers ?? [])]));
  return { ...ok[0], fixtures: ok.flatMap(r => r.fixtures), covers, notes: [] };
}
