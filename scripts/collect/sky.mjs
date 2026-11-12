// Sky Sports scores & fixtures pages. Each page embeds one JSON blob per match (data-state).
// Used as the cross-check for the English leagues. Times are UK time. The page shows a rolling run of
// match days, so `covers` lists exactly the days it displays; other days are never treated as "missing".
import { getText } from '../lib/http.mjs';
import { decodeEntities } from '../lib/html.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';
import { dayOfWeek } from '../lib/time.mjs';

export const NAME = 'Sky Sports';
export const SKY_PAGES = {
  'Premier League': 'https://www.skysports.com/premier-league-scores-fixtures',
  Championship: 'https://www.skysports.com/championship-scores-fixtures',
  'League One': 'https://www.skysports.com/league-1-scores-fixtures',
};
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** "Saturday 21st November" has no year; pick the year (near the run date) whose weekday matches. */
export function inferDate(text, today) {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/.exec(text ?? '');
  if (!m) return null;
  const wd = WEEKDAYS.indexOf(m[1].toLowerCase()), mon = MONTHS.indexOf(m[3].toLowerCase()) + 1, day = +m[2];
  if (wd < 0 || !mon) return null;
  const base = +today.slice(0, 4);
  const cands = [base - 1, base, base + 1]
    .map(y => `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    .filter(d => dayOfWeek(d) === wd);
  cands.sort((a, b) => Math.abs(Date.parse(a) - Date.parse(today)) - Math.abs(Date.parse(b) - Date.parse(today)));
  return cands[0] ?? null;
}

export function parseSky(html, competition, today) {
  const fixtures = [];
  const covers = new Set();
  for (const m of html.matchAll(/data-state="([^"]+)"/g)) {
    let s;
    try { s = JSON.parse(decodeEntities(m[1])); } catch { continue; }
    const home = s?.teams?.home?.name?.full, away = s?.teams?.away?.name?.full;
    if (!home || !away || !s.start?.date) continue;
    const date = inferDate(s.start.date, today);
    if (!date) continue;
    covers.add(date);
    const time = /^\d{1,2}:\d{2}$/.test(s.start.time ?? '') ? s.start.time : null;
    const postponed = s.isPostponed || looksPostponed(s.statusDescription?.full) || looksPostponed(s.summary?.full);
    fixtures.push(makeFixture({
      date, time, home, away, venue: s.venue?.name ?? (typeof s.venue === 'string' ? s.venue : null),
      competition, status: postponed ? 'postponed' : 'scheduled', source: NAME,
    }));
  }
  return { fixtures, covers };
}

export async function collect(competition, today) {
  const url = SKY_PAGES[competition];
  const meta = { id: 'sky-' + competition.toLowerCase().replace(/\W+/g, '-'), name: NAME, url, postponements: true };
  try {
    const html = await getText(url);
    const { fixtures, covers } = parseSky(html, competition, today);
    if (!fixtures.length) throw new Error('no fixtures found in page (layout may have changed)');
    return result(meta, { fixtures, covers, complete: false });
  } catch (e) { return failure(meta, e); }
}
