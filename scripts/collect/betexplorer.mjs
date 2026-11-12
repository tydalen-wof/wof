// BetExplorer fixtures page for Southern League Premier South. Times are CET/CEST and are converted to UK time.
// Limits: many rows have no date, short club names are used, and postponed games can be omitted.
// So it is a lenient cross-check: it can reveal a different time or home/away order, never a "missing" game,
// and it is never used to rule out postponements.
import { getText } from '../lib/http.mjs';
import { decodeEntities } from '../lib/html.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { fromCET, addDays } from '../lib/time.mjs';

export const NAME = 'BetExplorer';
export const META = { id: 'betexplorer', name: NAME, url: 'https://www.betexplorer.com/football/england/southern-league-premier-south/fixtures/', postponements: false };

/** "17.11. 20:45" or "12.01.2027 20:45" -> { date, time } (CET wall clock). Year is inferred near the run date. */
export function parseBetDate(text, today) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?\s*(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const pad = n => String(n).padStart(2, '0');
  let year = m[3] ? +m[3] : +today.slice(0, 4);
  let date = `${year}-${pad(m[2])}-${pad(m[1])}`;
  if (!m[3] && date < addDays(today, -183)) date = `${year + 1}-${pad(m[2])}-${pad(m[1])}`;
  return { date, time: `${pad(m[4])}:${m[5]}` };
}

export function parseBetExplorer(html, today) {
  const fixtures = [];
  let undated = 0;
  for (const tr of html.split(/<tr[ >]/).slice(1)) {
    const names = /class="in-match"><span>([^<]*)<\/span>\s*-\s*<span>([^<]*)<\/span>/.exec(tr);
    if (!names) continue;
    const cell = decodeEntities(/table-main__datetime[^>]*>([^<]*)</.exec(tr)?.[1] ?? '').trim();
    const dt = cell ? parseBetDate(cell, today) : null;
    if (!dt) { undated++; continue; }
    const uk = fromCET(dt.date, dt.time);
    fixtures.push(makeFixture({
      date: uk.date, time: uk.time, home: decodeEntities(names[1]).trim(), away: decodeEntities(names[2]).trim(),
      competition: 'Southern League Premier South', source: NAME,
    }));
  }
  return { fixtures, undated };
}

export async function collect(ctx) {
  try {
    const { fixtures, undated } = parseBetExplorer(await getText(META.url), ctx.today);
    if (!fixtures.length) throw new Error('no dated fixtures found in page (layout may have changed)');
    const res = result(META, {
      fixtures, complete: false, covers: new Set(fixtures.map(f => f.date)),
      notes: ['BetExplorer gives a date and time for only some games, so it can cross-check only those. It can also omit postponed games, so it is not used to rule out postponements.'],
    });
    res.lenient = true;
    return res;
  } catch (e) { return failure(META, e); }
}
