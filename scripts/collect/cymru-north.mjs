// Novira Cymru North, from faw.cymru. One plain request. See faw.mjs for how names and times are read.
// The page lists no venues, so only the followed clubs' grounds (config/teams.json) are shown; the rest are TBC.
import { getText } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';
import { parseFaw } from './faw.mjs';

export const NAME = 'FAW Cymru Leagues website';
export const META = { id: 'faw', name: NAME, url: 'https://faw.cymru/cymru-leagues/cymru-north/fixtures-and-results/', postponements: false };
export const COMPETITION = 'Novira Cymru North';

export async function collect(ctx) {
  try {
    const cards = parseFaw(await getText(META.url), 'novira-cymru-north', ctx.config?.fawSlugNames ?? {});
    if (!cards.length) throw new Error('no fixtures found in page (layout may have changed)');
    const grounds = ctx.config?.cymruNorthGrounds ?? {};
    const fixtures = [];
    let midnight = 0;
    for (const c of cards) {
      const uk = isoToUk(c.ms);
      const tbc = uk.time === '00:00';
      if (tbc) midnight++;
      fixtures.push(makeFixture({
        date: uk.date, time: tbc ? null : uk.time, home: c.home, away: c.away,
        venue: grounds[c.home]?.venue ?? null, competition: COMPETITION, source: NAME,
      }));
    }
    const notes = ['The FAW page lists no venues, so only the followed clubs\' grounds (from config/teams.json) are shown; other venues are TBC.'];
    if (midnight) notes.push(`${midnight} fixtures have a 00:00 kick-off on the FAW page; these are treated as time TBC.`);
    return result(META, { fixtures, teams: [...new Set(fixtures.flatMap(f => [f.home, f.away]))], complete: true, notes });
  } catch (e) { return failure(META, e); }
}
