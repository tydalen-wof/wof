// Novira Cymru North, from faw.cymru. One plain request.
// The page fills in team names with JavaScript (one extra API call per match), so names are taken from each match's
// URL slug instead; the kick-off is the exact UTC timestamp on the card. The page lists no venues and no postponement
// status without those per-match calls, so postponements cannot be checked from it.
import { getText } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';

export const NAME = 'FAW Cymru Leagues website';
export const META = { id: 'faw', name: NAME, url: 'https://faw.cymru/cymru-leagues/cymru-north/fixtures-and-results/', postponements: false };
export const COMPETITION = 'Novira Cymru North';

// Built-in overrides for slugs whose plain title-cased form is not how the club is known.
// More can be added in config/teams.json under cymruNorthSlugNames.
const SLUG_NAMES = {
  'cpd-y-rhyl-1879-fc': 'Rhyl 1879',
  'clwb-pel-droed-dinas-bangor-city-1876-football-club': 'Bangor City 1876',
};

export function slugToName(slug, extra = {}) {
  if (extra[slug]) return extra[slug];
  if (SLUG_NAMES[slug]) return SLUG_NAMES[slug];
  return slug.replace(/^cpd-/, '').replace(/-(afc|fc)$/, '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function parseFaw(html, slugNames = {}) {
  const starts = [...html.matchAll(/data-match-id="(\d+)"\s+data-match-kickoff-utc="(\d+)"/g)];
  const out = [];
  starts.forEach((m, i) => {
    const chunk = html.slice(m.index, starts[i + 1]?.index ?? html.length);
    const slug = /\/match\/([^/"]+)\//.exec(chunk)?.[1];
    const t = slug && /^(.*)-vs-(.*?)-novira-cymru-north/.exec(slug);
    if (!t) return;
    out.push({ id: m[1], ms: +m[2], home: slugToName(t[1], slugNames), away: slugToName(t[2], slugNames) });
  });
  return out;
}

export async function collect(ctx) {
  try {
    const cards = parseFaw(await getText(META.url), ctx.config?.cymruNorthSlugNames ?? {});
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
