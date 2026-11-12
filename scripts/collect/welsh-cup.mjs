// FAW Welsh Cup (men's), from faw.cymru. Same platform and rules as Cymru North (see faw.mjs).
// The page lists every tie drawn so far, whatever `?currentDate=` says, so the plain address is used.
import { getText } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';
import { parseFaw } from './faw.mjs';

export const NAME = 'FAW Welsh Cup website';
export const META = { id: 'welsh-cup', name: NAME, url: 'https://faw.cymru/mens-welsh-cup/welsh-cup-fixtures-results/', postponements: false };
export const COMPETITION = 'FAW Welsh Cup';

export async function collect(ctx) {
  try {
    const cards = parseFaw(await getText(META.url), 'faw-welsh-cup', ctx.config?.fawSlugNames ?? {});
    if (!cards.length) throw new Error('no fixtures found in page (layout may have changed)');
    const fixtures = [];
    let midnight = 0;
    for (const c of cards) {
      const uk = isoToUk(c.ms);
      const tbc = uk.time === '00:00';
      if (tbc) midnight++;
      fixtures.push(makeFixture({
        date: uk.date, time: tbc ? null : uk.time, home: c.home, away: c.away,
        venue: null, competition: COMPETITION, tag: 'Welsh Cup', source: NAME,
      }));
    }
    const notes = ['The FAW page lists no venues. Grounds come from the stored lookup (data/postcodes.json) where known; other venues are TBC.'];
    if (midnight) notes.push(`${midnight} fixtures have a 00:00 kick-off on the FAW page; these are treated as time TBC.`);
    return result(META, { fixtures, teams: [...new Set(fixtures.flatMap(f => [f.home, f.away]))], complete: true, notes });
  } catch (e) { return failure(META, e); }
}
